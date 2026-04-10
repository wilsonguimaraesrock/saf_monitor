-- Adiciona constraint única para evitar duplicar mensagens do mesmo autor/horário
ALTER TABLE saf_ticket_updates
  ADD CONSTRAINT uq_ticket_update UNIQUE (ticket_id, occurred_at, author);
