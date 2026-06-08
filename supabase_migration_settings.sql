-- ==========================================
-- APP SETTINGS MIGRATION (Phase 2.3)
-- ==========================================

-- Vytvoření tabulky pro ukládání aplikačních nastavení (náhrada za localStorage)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT
);

-- Vložení výchozích dat, pokud ještě neexistují
INSERT INTO app_settings (key, value)
VALUES 
(
  'shifts', 
  '{
    "morningStart": "05:45",
    "morningEnd": "13:45",
    "afternoonStart": "13:45",
    "afternoonEnd": "21:45",
    "breakMinutes": 30,
    "evenWeekShiftAMorning": true
  }'::jsonb
),
(
  'targets',
  '[
    { "id": "1", "name": "Ranní směna", "pickingTOTarget": 200, "packingHUTarget": 150, "pickingKsTarget": 8000, "packingKsTarget": 6000 },
    { "id": "2", "name": "Odpolední směna", "pickingTOTarget": 180, "packingHUTarget": 130, "pickingKsTarget": 7000, "packingKsTarget": 5500 },
    { "id": "3", "name": "Operátor (denní)", "pickingTOTarget": 25, "packingHUTarget": 20, "pickingKsTarget": 1000, "packingKsTarget": 800 }
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Přidání helper funkcí (nepovinné, pokud se tahá přímo z tabulky)
