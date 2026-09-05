// src/components/ui/HistoryModal.js
//
// "History" button + drawer for list pages: shows the full change history of
// one row without leaving the list.
import React, { useState } from 'react';
import { History } from 'lucide-react';
import ActivityFeed from './ActivityFeed';
import { Modal, Btn } from './index';

export function HistoryButton({ collection, recordId, label, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn size={size} variant="secondary" icon={History}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        History
      </Btn>
      {/* display:contents keeps the wrapper out of the row's layout while still
          catching clicks, so tapping inside the modal does not also trigger the
          table row underneath it. */}
      <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
        <HistoryModal open={open} onClose={() => setOpen(false)}
          collection={collection} recordId={recordId} label={label} />
      </span>
    </>
  );
}

export default function HistoryModal({ open, onClose, collection, recordId, label }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={label ? `History — ${label}` : 'History'} width={620}>
      <ActivityFeed collection={collection} recordId={recordId} embedded />
    </Modal>
  );
}
