-- Calendario fornito dal club: 30 gare di campionato + 2 gare di coppa.
-- Eseguire DOPO 202609100033_results_calendar.sql nel SQL Editor Supabase.
-- Idempotente: non sovrascrive risultati/date già modificati dal backoffice.
-- Orari Europe/Rome; campi di gioco non indicati negli allegati lasciati NULL.
BEGIN;
WITH fixtures AS (
  SELECT * FROM jsonb_to_recordset($fixtures$
[
  {
    "legacy_key": "2026-27:league:1",
    "season_id": "2026-27",
    "match_day": "1",
    "home_team": "Capraia",
    "away_team": "Isolotto",
    "local_kickoff": "2026-09-20 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:2",
    "season_id": "2026-27",
    "match_day": "2",
    "home_team": "S. Godenzo A.S.D.",
    "away_team": "Capraia",
    "local_kickoff": "2026-09-27 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:3",
    "season_id": "2026-27",
    "match_day": "3",
    "home_team": "Capraia",
    "away_team": "S. Piero a Sieve A.S.D.",
    "local_kickoff": "2026-10-04 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:4",
    "season_id": "2026-27",
    "match_day": "4",
    "home_team": "Daytona Calcio",
    "away_team": "Capraia",
    "local_kickoff": "2026-10-11 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:5",
    "season_id": "2026-27",
    "match_day": "5",
    "home_team": "Capraia",
    "away_team": "Ginestra Fiorentina ASD",
    "local_kickoff": "2026-10-18 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:6",
    "season_id": "2026-27",
    "match_day": "6",
    "home_team": "Capraia",
    "away_team": "Sporting Arno A.S.D.",
    "local_kickoff": "2026-10-25 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:7",
    "season_id": "2026-27",
    "match_day": "7",
    "home_team": "Chianti Nord A.S.D.",
    "away_team": "Capraia",
    "local_kickoff": "2026-11-01 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:8",
    "season_id": "2026-27",
    "match_day": "8",
    "home_team": "Capraia",
    "away_team": "Barberino Calcio 1927",
    "local_kickoff": "2026-11-08 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:9",
    "season_id": "2026-27",
    "match_day": "9",
    "home_team": "Gambassi",
    "away_team": "Capraia",
    "local_kickoff": "2026-11-15 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:10",
    "season_id": "2026-27",
    "match_day": "10",
    "home_team": "Capraia",
    "away_team": "Sagginale",
    "local_kickoff": "2026-11-22 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:11",
    "season_id": "2026-27",
    "match_day": "11",
    "home_team": "La Nuova Pol. Novoli",
    "away_team": "Capraia",
    "local_kickoff": "2026-11-29 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {
      "home_logo": "assets/teams/novoli.png"
    }
  },
  {
    "legacy_key": "2026-27:league:12",
    "season_id": "2026-27",
    "match_day": "12",
    "home_team": "Capraia",
    "away_team": "Real Peretola",
    "local_kickoff": "2026-12-06 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:13",
    "season_id": "2026-27",
    "match_day": "13",
    "home_team": "Fiesole Calcio",
    "away_team": "Capraia",
    "local_kickoff": "2026-12-13 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:14",
    "season_id": "2026-27",
    "match_day": "14",
    "home_team": "Capraia",
    "away_team": "Calcio Albacarraia 1997",
    "local_kickoff": "2026-12-20 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:15",
    "season_id": "2026-27",
    "match_day": "15",
    "home_team": "Gallianese",
    "away_team": "Capraia",
    "local_kickoff": "2027-01-03 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Andata",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:16",
    "season_id": "2026-27",
    "match_day": "16",
    "home_team": "Isolotto",
    "away_team": "Capraia",
    "local_kickoff": "2027-01-10 14:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:17",
    "season_id": "2026-27",
    "match_day": "17",
    "home_team": "Capraia",
    "away_team": "S. Godenzo A.S.D.",
    "local_kickoff": "2027-01-17 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:18",
    "season_id": "2026-27",
    "match_day": "18",
    "home_team": "S. Piero a Sieve A.S.D.",
    "away_team": "Capraia",
    "local_kickoff": "2027-01-24 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:19",
    "season_id": "2026-27",
    "match_day": "19",
    "home_team": "Capraia",
    "away_team": "Daytona Calcio",
    "local_kickoff": "2027-01-31 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:20",
    "season_id": "2026-27",
    "match_day": "20",
    "home_team": "Ginestra Fiorentina ASD",
    "away_team": "Capraia",
    "local_kickoff": "2027-02-07 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:21",
    "season_id": "2026-27",
    "match_day": "21",
    "home_team": "Sporting Arno A.S.D.",
    "away_team": "Capraia",
    "local_kickoff": "2027-02-14 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:22",
    "season_id": "2026-27",
    "match_day": "22",
    "home_team": "Capraia",
    "away_team": "Chianti Nord A.S.D.",
    "local_kickoff": "2027-02-21 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:23",
    "season_id": "2026-27",
    "match_day": "23",
    "home_team": "Barberino Calcio 1927",
    "away_team": "Capraia",
    "local_kickoff": "2027-02-28 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:24",
    "season_id": "2026-27",
    "match_day": "24",
    "home_team": "Capraia",
    "away_team": "Gambassi",
    "local_kickoff": "2027-03-07 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:25",
    "season_id": "2026-27",
    "match_day": "25",
    "home_team": "Sagginale",
    "away_team": "Capraia",
    "local_kickoff": "2027-03-14 15:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:26",
    "season_id": "2026-27",
    "match_day": "26",
    "home_team": "Capraia",
    "away_team": "La Nuova Pol. Novoli",
    "local_kickoff": "2027-04-04 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {
      "away_logo": "assets/teams/novoli.png"
    }
  },
  {
    "legacy_key": "2026-27:league:27",
    "season_id": "2026-27",
    "match_day": "27",
    "home_team": "Real Peretola",
    "away_team": "Capraia",
    "local_kickoff": "2027-04-11 15:30",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:28",
    "season_id": "2026-27",
    "match_day": "28",
    "home_team": "Capraia",
    "away_team": "Fiesole Calcio",
    "local_kickoff": "2027-04-18 16:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:29",
    "season_id": "2026-27",
    "match_day": "29",
    "home_team": "Calcio Albacarraia 1997",
    "away_team": "Capraia",
    "local_kickoff": "2027-04-25 16:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:league:30",
    "season_id": "2026-27",
    "match_day": "30",
    "home_team": "Capraia",
    "away_team": "Gallianese",
    "local_kickoff": "2027-05-02 16:00",
    "competition": "Prima Categoria · Girone C",
    "phase": "Ritorno",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:cup:group14:2",
    "season_id": "2026-27",
    "match_day": "Gara 2",
    "home_team": "San Miniato",
    "away_team": "Capraia",
    "local_kickoff": "2026-09-13 15:30",
    "competition": "Coppa Toscana · Prima Categoria",
    "phase": "Fase a gironi · Girone 14",
    "extra_info": {}
  },
  {
    "legacy_key": "2026-27:cup:group14:3",
    "season_id": "2026-27",
    "match_day": "Gara 3",
    "home_team": "Capraia",
    "away_team": "Ginestra Fiorentina ASD",
    "local_kickoff": "2026-09-23 15:30",
    "competition": "Coppa Toscana · Prima Categoria",
    "phase": "Fase a gironi · Girone 14",
    "extra_info": {}
  }
]
$fixtures$::jsonb) AS f (
    legacy_key text, season_id text, match_day text, home_team text,
    away_team text, local_kickoff text, competition text, phase text, extra_info jsonb
  )
)
INSERT INTO public.matches (legacy_key, season_id, match_day, home_team, away_team,
  kickoff_at, competition, phase, status, extra_info, published)
SELECT f.legacy_key, f.season_id, f.match_day, f.home_team, f.away_team,
  f.local_kickoff::timestamp AT TIME ZONE 'Europe/Rome', f.competition, f.phase,
  'scheduled', f.extra_info, true
FROM fixtures f
WHERE NOT EXISTS (
  SELECT 1 FROM public.matches m
  WHERE m.season_id = f.season_id AND m.competition = f.competition
    AND m.match_day = f.match_day
    AND lower(m.home_team) = lower(f.home_team) AND lower(m.away_team) = lower(f.away_team)
)
ON CONFLICT (legacy_key) DO NOTHING;
COMMIT;

