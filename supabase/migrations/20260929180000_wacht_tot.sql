-- "Niet melden tot": zolang deze datum in de toekomst ligt, blijft het project uit de
-- Aandacht-nodig-lijst in het dashboard (behalve status 'controleren'). Handmatig
-- gezet in het projectvenster. Kolom is al op 29 sep 2026 rechtstreeks in Supabase
-- aangemaakt; dit bestand legt dat vast zodat een verse database hetzelfde krijgt.
alter table public.projecten
  add column if not exists wacht_tot date;
