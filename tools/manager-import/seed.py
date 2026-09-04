#!/usr/bin/env python3
"""
Transform extracted Manager.io JSON into ERP document rows and POST them to
the erp-seed Supabase edge function in chunks.

Usage: python3 seed.py <extracted-json-dir> <function-url> <seed-token>
"""
import sys, json, os, urllib.request


def post(url, token, table, rows):
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        req = urllib.request.Request(
            url, data=json.dumps({'table': table, 'rows': chunk}).encode(),
            headers={'content-type': 'application/json', 'x-seed-token': token},
            method='POST')
        with urllib.request.urlopen(req) as r:
            resp = json.load(r)
            if not resp.get('ok'):
                raise SystemExit(f"seed failed for {table}: {resp}")
    print(f"{table}: {len(rows)} rows seeded")


def main(src, url, token):
    load = lambda n: json.load(open(os.path.join(src, n)))
    items = load('inventory.json')
    customers = load('customers.json')
    suppliers = load('suppliers.json')
    purchases = load('purchase_invoices.json')
    sales = load('sales_invoices.json')

    item_by_key = {i['managerKey']: i for i in items}
    supp_by_key = {s['managerKey']: s for s in suppliers}
    cust_by_key = {c['managerKey']: c for c in customers}

    inv_rows = []
    for n, it in enumerate(sorted(items, key=lambda i: (i['name'].lower(), i['managerKey'])), 1):
        it['_code'] = it.get('code') or f"ITM-{n:04d}"
        inv_rows.append({'id': it['managerKey'], 'doc': {
            'code': it['_code'], 'name': it['name'] or f"(unnamed {n})",
            'description': '', 'brand': '', 'category': '',
            'unit': it.get('unit') or 'pcs',
            'costPrice': it.get('costPrice') or 0,
            'salePrice': it.get('salePrice') or 0,
            'quantity': it.get('quantity') or 0,
            'reorderLevel': 10, 'warehouseId': '', 'supplierId': '',
            'taxRate': 0, 'barcode': '', 'status': 'active',
            'managerKey': it['managerKey'], 'importedFrom': 'manager.io',
        }})

    def party_rows(parties, kind):
        rows = []
        for p in parties:
            rows.append({'id': p['managerKey'], 'doc': {
                'name': p['name'] or '(unnamed)', 'company': '', 'email': '',
                'phone': '', 'address': '', 'city': '', 'country': 'Pakistan',
                **({'type': 'retail'} if kind == 'customer' else {'category': 'goods'}),
                'balance': 0, 'currency': 'PKR',
                'managerKey': p['managerKey'], 'importedFrom': 'manager.io',
            }})
        return rows

    def line_docs(lines):
        out = []
        for ln in lines:
            it = item_by_key.get(ln.get('itemKey') or '')
            qty, price = ln.get('qty') or 0, ln.get('unitPrice') or 0
            out.append({
                'itemId': ln.get('itemKey') or '',
                'itemCode': (it or {}).get('_code', ''),
                'itemName': (it or {}).get('name') or ln.get('description') or '(item)',
                'description': ln.get('description') or '',
                'qty': qty, 'unit': (it or {}).get('unit', 'pcs'),
                'unitPrice': price, 'discount': 0, 'taxRate': 0,
                'total': round(qty * price, 2), 'isCustom': it is None,
            })
        return out

    pi_rows = []
    for n, inv in enumerate(sorted(purchases, key=lambda i: (i.get('date') or '', i.get('ref') or '')), 1):
        supp = supp_by_key.get(inv.get('supplierKey') or '')
        total = inv.get('total') or 0
        pi_rows.append({'id': inv['managerKey'],
                        'createdAt': inv.get('enteredAt'),
                        'doc': {
            'invoiceNo': f"PI-{n:04d}", 'supplierInvoiceNo': inv.get('ref') or '',
            'date': inv.get('date') or '', 'dueDate': '',
            'supplierId': (supp or {}).get('managerKey', ''),
            'supplierName': (supp or {}).get('name', ''),
            'supplierPhone': '', 'supplierAddress': '',
            'status': 'paid', 'paymentMethod': '',
            'notes': f"Imported from Manager.io ({inv.get('book','')})",
            'items': line_docs(inv.get('lines') or []),
            'subtotal': total, 'discountAmount': 0, 'taxAmount': 0,
            'total': total, 'paidAmount': total, 'currency': 'PKR',
            'managerKey': inv['managerKey'], 'importedFrom': 'manager.io',
        }})

    si_rows = []
    for inv in sorted(sales, key=lambda i: (i.get('date') or '', i.get('ref') or '')):
        cust = cust_by_key.get(inv.get('customerKey') or '')
        total = inv.get('total') or 0
        si_rows.append({'id': inv['managerKey'],
                        'createdAt': inv.get('enteredAt'),
                        'doc': {
            'invoiceNo': inv.get('ref') or '', 'date': inv.get('date') or '',
            'dueDate': '',
            'customerId': (cust or {}).get('managerKey', ''),
            'customerName': (cust or {}).get('name', ''),
            'customerPhone': '', 'customerAddress': '',
            'status': 'paid', 'paymentMethod': '',
            'notes': f"Imported from Manager.io ({inv.get('book','')})",
            'items': line_docs(inv.get('lines') or []),
            'subtotal': total, 'discountAmount': 0, 'taxAmount': 0,
            'total': total, 'paidAmount': total, 'currency': 'PKR',
            'managerKey': inv['managerKey'], 'importedFrom': 'manager.io',
        }})

    post(url, token, 'erp_inventory', inv_rows)
    post(url, token, 'erp_customers', party_rows(customers, 'customer'))
    post(url, token, 'erp_suppliers', party_rows(suppliers, 'supplier'))
    post(url, token, 'erp_purchase_invoices', pi_rows)
    post(url, token, 'erp_sales_invoices', si_rows)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
