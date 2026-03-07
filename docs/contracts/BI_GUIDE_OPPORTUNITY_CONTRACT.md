# BI Guide Opportunity Contract

## Purpose
- Beschreibt den maschinenlesbaren Opportunity-Stand fuer BI-Guide-Themen.

## Producer
- `BI-Guide Quellen und Planung`

## Consumers
- `BI-Guide Chancen aktualisieren`
- `BI-Guide Ablauf automatisch steuern`
- Obsidian Register und Uebersichten

## Required Fields
- `snapshot_id`
- `collection_window`
- `search_console_status`
- `manual_signal_status`
- `entries[].opportunity_id`
- `entries[].intent`
- `entries[].persona`
- `entries[].use_case`
- `entries[].priority_score`
- `entries[].recommendation`

## Score Components
- `demand_signal`
- `business_fit`
- `evidence_ready`
- `freshness_score`

## Freshness Rules
- Search-Console-Daten werden nur fuer das konfigurierte Fenster verwendet.
- Refresh-Kandidaten basieren auf Lookback- und Stale-Regeln aus `opportunity-settings.json`.

## Example Payload
```json
{
  "generated_at": "2026-03-06T10:00:00Z",
  "entries": [
    {
      "opportunity_id": "opp-bi-dashboard-kpi",
      "source": "search_console",
      "type": "net_new",
      "locale": "de",
      "title_hint": "BI Dashboard KPIs",
      "article_hint": "bi-dashboard-kpis",
      "intent": "MOFU",
      "persona": "Founder",
      "use_case": "Dashboarding",
      "asset_type": "article",
      "proof_required": "benchmark",
      "demand_signal": 71,
      "business_fit": 84,
      "evidence_ready": 63,
      "freshness_score": 66,
      "priority_score": 76,
      "recommendation": "candidate_for_generation",
      "reasons": [
        "search-demand",
        "product-fit"
      ]
    }
  ]
}
```
