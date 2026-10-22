

CREATE SEQUENCE opportunity_code_seq START 2008;

CREATE TABLE opportunities (
  code                 text PRIMARY KEY DEFAULT ('OPP-' || nextval('opportunity_code_seq')::text),
  company              text NOT NULL,
  seller               text NOT NULL,
  estimated_value      numeric(12,2),
  stage                text NOT NULL DEFAULT 'primeiro_contato',
  last_contact_at      date,
  proposal_valid_until date,
  event_date           date,
  loss_reason          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_not_blank CHECK (length(btrim(company)) > 0),
  CONSTRAINT seller_not_blank CHECK (length(btrim(seller)) > 0),
  CONSTRAINT stage_valid CHECK (stage IN (
    'primeiro_contato', 'apresentacao_orcamento', 'follow_up', 'forecast', 'fechamento', 'perdida'
  )),
  CONSTRAINT value_non_negative CHECK (estimated_value IS NULL OR estimated_value >= 0),

  CONSTRAINT value_required_after_first_contact CHECK (
    stage IN ('primeiro_contato', 'perdida') OR COALESCE(estimated_value, 0) > 0
  ),
  CONSTRAINT loss_reason_required CHECK (
    stage <> 'perdida' OR (loss_reason IS NOT NULL AND length(btrim(loss_reason)) > 0)
  ),
  CONSTRAINT loss_reason_only_when_lost CHECK (stage = 'perdida' OR loss_reason IS NULL)
);

CREATE INDEX opportunities_stage_idx ON opportunities (stage);
CREATE INDEX opportunities_seller_idx ON opportunities (seller);

CREATE TABLE opportunity_items (
  id               bigserial PRIMARY KEY,
  opportunity_code text NOT NULL REFERENCES opportunities (code) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(btrim(name)) > 0),
  quantity         integer NOT NULL CHECK (quantity > 0)
);

CREATE INDEX opportunity_items_opportunity_idx ON opportunity_items (opportunity_code);

CREATE TABLE stage_history (
  id               bigserial PRIMARY KEY,
  opportunity_code text NOT NULL REFERENCES opportunities (code) ON DELETE CASCADE,
  from_stage       text,                
  to_stage         text NOT NULL,
  note             text,
  changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stage_history_opportunity_idx ON stage_history (opportunity_code, changed_at, id);
