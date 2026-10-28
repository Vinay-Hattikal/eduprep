-- Gap-free invoice numbers for GST invoices (D-040). Taken only when an order is paid.
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1;
