#!/usr/bin/env python3
"""
Extract data from Manager.io (.manager) SQLite files into JSON for import
into the S.I Trading ERP (Supabase).

Manager.io (2022+ desktop versions) stores each business as a SQLite file
with an Objects table: Key (GUID), ContentType (GUID identifying the entity
type), Content (protobuf), Timestamp (.NET ticks).

Entity content-type GUIDs seen in these books:
  0dbdbf8a-d80c-48e6-b453-bb7862445b7c  InventoryItem
  ec37c11e-2b67-49c6-8a58-6eccb7dd75ee  Customer
  6d2dc48d-2053-4e45-8330-285ebd431242  Supplier
  ad12b60b-23bf-4421-94df-8be79cef533e  SalesInvoice
  58b9eb90-f6b8-4abc-8ea1-12fd77b8336e  PurchaseInvoice

Dates are stored as {1: <day serial>}. The epoch was calibrated against a
known paper invoice (ref 588 = 18/08/2026): epoch ordinal = 698480.

Usage: python3 extract.py <dir-with-.manager-files> <output-dir>
"""
import sys, os, json, glob, sqlite3, struct, datetime, collections

CT_ITEM = '0dbdbf8a-d80c-48e6-b453-bb7862445b7c'
CT_CUSTOMER = 'ec37c11e-2b67-49c6-8a58-6eccb7dd75ee'
CT_SUPPLIER = '6d2dc48d-2053-4e45-8330-285ebd431242'
CT_SALES_INV = 'ad12b60b-23bf-4421-94df-8be79cef533e'
CT_PURCH_INV = '58b9eb90-f6b8-4abc-8ea1-12fd77b8336e'

EPOCH_ORDINAL = datetime.date(2026, 8, 18).toordinal() - 41366  # 698480


def read_varint(b, i):
    r = 0; s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s
        if not x & 0x80:
            return r, i
        s += 7


def fields(b):
    i = 0
    while i < len(b):
        tag, i = read_varint(b, i)
        f, wt = tag >> 3, tag & 7
        if wt == 0:
            v, i = read_varint(b, i); yield f, 0, v
        elif wt == 1:
            yield f, 1, struct.unpack('<d', b[i:i+8])[0]; i += 8
        elif wt == 2:
            l, i = read_varint(b, i); yield f, 2, b[i:i+l]; i += l
        elif wt == 5:
            yield f, 5, struct.unpack('<f', b[i:i+4])[0]; i += 4
        else:
            raise ValueError(f'bad wiretype {wt}')


def get(b, n, default=None):
    if b is None:
        return default
    for f, wt, v in fields(b):
        if f == n:
            return v
    return default


def getall(b, n):
    if b is None:
        return []
    return [v for f, wt, v in fields(b) if f == n]


def s(b, n):
    v = get(b, n)
    return v.decode('utf-8', 'replace') if isinstance(v, bytes) else ''


def guid(p):
    """Manager serializes GUIDs as a message {1: fixed64, 2: fixed64} (raw .NET Guid bytes)."""
    if not isinstance(p, bytes) or len(p) != 18 or p[0] != 0x09 or p[9] != 0x11:
        return None
    g = p[1:9] + p[10:18]
    d1, d2, d3 = struct.unpack('<IHH', g[:8])
    return f"{d1:08x}-{d2:04x}-{d3:04x}-{g[8:10].hex()}-{g[10:16].hex()}"


def number(p):
    """Decimal message: {1: unscaled int, 3: scale}. e.g. {1: 2625, 3: 2} = 26.25"""
    if not isinstance(p, bytes):
        return 0.0
    d = {}
    try:
        for f, wt, v in fields(p):
            d.setdefault(f, v)
    except Exception:
        return 0.0
    val = d.get(1, 0)
    if not isinstance(val, int):
        return 0.0
    scale = d.get(3, 0)
    if isinstance(scale, int) and 0 < scale < 12:
        return val / (10 ** scale)
    return float(val)


def day_to_date(p):
    d = get(p, 1)
    if not isinstance(d, int):
        return None
    ordv = EPOCH_ORDINAL + d
    if ordv < datetime.date(2000, 1, 1).toordinal() or ordv > datetime.date(2100, 1, 1).toordinal():
        return None
    return datetime.date.fromordinal(ordv).isoformat()


def ticks_to_iso(t):
    if not t:
        return None
    return (datetime.datetime(1, 1, 1) + datetime.timedelta(microseconds=t / 10)).isoformat()


def invoice_lines(b, line_field):
    lines = []
    for ln in getall(b, line_field):
        item = guid(get(ln, 1))
        qty = number(get(ln, 18))
        price = number(get(ln, 19))
        desc = s(ln, 27)
        if item is None and not desc and qty == 0 and price == 0:
            continue  # empty filler rows Manager leaves behind
        lines.append({'itemKey': item, 'qty': qty, 'unitPrice': price, 'description': desc})
    return lines


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    books = sorted(glob.glob(os.path.join(src_dir, '*.manager')))
    books = [b for b in books if os.path.basename(b) != '00000000000000000000000000000000.manager']

    items = {}          # key -> item
    customers = {}      # key -> {name}
    suppliers = {}
    purchase_invoices = {}
    sales_invoices = {}
    name_history = {}   # key -> last non-empty name seen anywhere (Changes or older books)

    for path in books:
        book = os.path.splitext(os.path.basename(path))[0]
        con = sqlite3.connect(path)
        cur = con.cursor()

        # Recover names from the Changes audit trail (current customer objects in
        # the newer books have had their names blanked).
        try:
            for obj, ca, ts in cur.execute(
                    "SELECT Object, ContentAfter, Timestamp FROM Changes WHERE ContentAfter IS NOT NULL"):
                try:
                    nm = s(bytes(ca), 1)
                except Exception:
                    continue
                if nm:
                    prev = name_history.get(obj)
                    if prev is None or ts >= prev[1]:
                        name_history[obj] = (nm, ts)
        except sqlite3.OperationalError:
            pass

        for key, ct, content, ts in cur.execute(
                "SELECT Key, ContentType, Content, Timestamp FROM Objects"):
            b = bytes(content) if content else b''
            if ct == CT_ITEM:
                rec = {
                    'managerKey': key,
                    'code': s(b, 1),
                    'name': s(b, 11),
                    'unit': s(b, 13) or 'pcs',
                    'book': book,
                }
                # newest book wins (books are processed in filename order; later
                # books overwrite, and the 2026 book sorts last among these files)
                items[key] = {**items.get(key, {}), **{k: v for k, v in rec.items() if v or k not in items.get(key, {})}}
            elif ct == CT_CUSTOMER:
                nm = s(b, 1)
                cur_rec = customers.get(key, {})
                customers[key] = {'managerKey': key, 'name': nm or cur_rec.get('name', '')}
            elif ct == CT_SUPPLIER:
                nm = s(b, 1)
                cur_rec = suppliers.get(key, {})
                suppliers[key] = {'managerKey': key, 'name': nm or cur_rec.get('name', '')}
            elif ct == CT_PURCH_INV:
                lines = invoice_lines(b, 23)
                date = day_to_date(get(b, 1))
                ref = s(b, 2)
                if not lines and not ref:
                    continue
                purchase_invoices[key] = {
                    'managerKey': key, 'book': book, 'date': date, 'ref': ref,
                    'supplierKey': guid(get(b, 3)), 'lines': lines,
                    'enteredAt': ticks_to_iso(ts),
                }
            elif ct == CT_SALES_INV:
                lines = invoice_lines(b, 49)
                date = day_to_date(get(b, 1))
                ref = s(b, 2)
                if not lines and not ref:
                    continue
                sales_invoices[key] = {
                    'managerKey': key, 'book': book, 'date': date, 'ref': ref,
                    'customerKey': guid(get(b, 3)), 'lines': lines,
                    'enteredAt': ticks_to_iso(ts),
                }
        con.close()

    # Fill blank customer/supplier names from the audit history
    for coll in (customers, suppliers):
        for key, rec in coll.items():
            if not rec['name'] and key in name_history:
                rec['name'] = name_history[key][0]

    # The 2023 book uses its own GUIDs while 2024-2026 share theirs, so merge
    # entities across books by normalized name. Build key -> canonical key maps.
    def merge_by_name(coll, extra_key=lambda r: ''):
        canon = {}          # (name, extra) -> canonical record
        keymap = {}         # any managerKey -> canonical managerKey
        for key in sorted(coll):  # deterministic; later books keep their key via sort? use first named
            rec = coll[key]
            norm = rec['name'].strip().strip('_').strip().lower()
            ident = (norm, extra_key(rec)) if norm else (key, '')
            if ident in canon:
                keymap[key] = canon[ident]['managerKey']
                canon[ident].setdefault('altKeys', []).append(key)
                # prefer the cleaner of the two display names
                a, b = canon[ident]['name'], rec['name']
                canon[ident]['name'] = min((a, b), key=lambda n: (len(n.strip('_ ')), n))
            else:
                canon[ident] = rec
                keymap[key] = key
        return {r['managerKey']: r for r in canon.values()}, keymap

    items, item_map = merge_by_name(items, lambda r: r.get('unit', ''))
    customers, cust_map = merge_by_name(customers)
    suppliers, supp_map = merge_by_name(suppliers)

    for inv in purchase_invoices.values():
        inv['supplierKey'] = supp_map.get(inv['supplierKey'], inv['supplierKey'])
        for ln in inv['lines']:
            ln['itemKey'] = item_map.get(ln['itemKey'], ln['itemKey'])
    for inv in sales_invoices.values():
        inv['customerKey'] = cust_map.get(inv['customerKey'], inv['customerKey'])
        for ln in inv['lines']:
            ln['itemKey'] = item_map.get(ln['itemKey'], ln['itemKey'])

    # Derive item stats: last cost, last sale price, on-hand qty from history
    stats = collections.defaultdict(lambda: {'qtyIn': 0.0, 'qtyOut': 0.0,
                                             'lastCost': 0.0, 'lastCostDate': '',
                                             'lastSale': 0.0, 'lastSaleDate': ''})
    for inv in purchase_invoices.values():
        for ln in inv['lines']:
            if not ln['itemKey']:
                continue
            st = stats[ln['itemKey']]
            st['qtyIn'] += ln['qty']
            if inv['date'] and inv['date'] >= st['lastCostDate']:
                st['lastCost'], st['lastCostDate'] = ln['unitPrice'], inv['date']
    for inv in sales_invoices.values():
        for ln in inv['lines']:
            if not ln['itemKey']:
                continue
            st = stats[ln['itemKey']]
            st['qtyOut'] += ln['qty']
            if inv['date'] and inv['date'] >= st['lastSaleDate']:
                st['lastSale'], st['lastSaleDate'] = ln['unitPrice'], inv['date']
    for key, item in items.items():
        st = stats.get(key)
        item['costPrice'] = st['lastCost'] if st else 0
        item['salePrice'] = st['lastSale'] if st else 0
        item['quantity'] = round(st['qtyIn'] - st['qtyOut'], 4) if st else 0

    for inv in list(purchase_invoices.values()) + list(sales_invoices.values()):
        inv['total'] = round(sum(l['qty'] * l['unitPrice'] for l in inv['lines']), 2)

    def dump(name, data):
        rows = sorted(data.values(), key=lambda r: (r.get('date') or '', r.get('ref') or '', r['managerKey']))
        with open(os.path.join(out_dir, name), 'w') as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
        print(f"{name}: {len(rows)} rows")

    dump('inventory.json', items)
    dump('customers.json', customers)
    dump('suppliers.json', suppliers)
    dump('purchase_invoices.json', purchase_invoices)
    dump('sales_invoices.json', sales_invoices)

    named = sum(1 for c in customers.values() if c['name'])
    print(f"customers with recovered names: {named}/{len(customers)}")
    tp = sum(i['total'] for i in purchase_invoices.values())
    print(f"total purchases value: {tp:,.0f}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
