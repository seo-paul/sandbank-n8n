# BI Guide Article Package Contract

## Purpose
Definiert den strukturierten Output eines artikelreifen BI-Guide-Entwurfs vor Publication-Fit und Export.

## Producer
- Workflow: `BI-Guide Artikelpaket erstellen`

## Consumers
- Publication-Fit-Logik
- Human Review Gate
- Persistenz nach Obsidian
- ExportBundle-Generator

## Required Fields
- `article_id`
- `frontmatter`
- `body_mdx`
- `internal_links`
- `external_sources`
- `media_brief`
- `quality_notes`

## Frontmatter Pflichtfelder
- `id`
- `title`
- `description`
- `seoTitle`
- `seoDescription`
- `heroSubtitle`
- `navTitle`
- `visibility`
- `kind`
- `helpSlug`
- `categoryId`
- `articleOrder`
- `audience`
- `keyTakeaways`
- `authorId`
- `authorRole`
- `reviewer`
- `publishedAt`
- `tileBody`
- `last_reviewed`
- `collection`
- `categoryOrder`
- `articleNumber`

## Regeln
- Das Package darf keine unbekannten Root-Felder enthalten.
- Strukturelle Felder werden durch den Workflow normalisiert und nicht dem Modell ueberlassen.
- `body_mdx` enthaelt keine H1.
- Interne Links muessen spaeter gegen die aktuelle Route-Map validiert werden.

## Example Payload
```json
{
  "article_id": "data-quality-pragmatisch-loesen",
  "frontmatter": {
    "id": "data-quality-pragmatisch-loesen",
    "title": "Datenqualitaet im Griff: Typische Probleme und pragmatische Loesungen",
    "description": "Ein praxisnaher Leitfaden fuer haeufige Ursachen schlechter Datenqualitaet.",
    "seoTitle": "Datenqualitaet verbessern: Pragmaticher Leitfaden",
    "seoDescription": "Ursachen, Priorisierung und pragmatische Massnahmen fuer bessere Datenqualitaet im BI-Alltag.",
    "heroSubtitle": "Wie Teams Datenqualitaet strukturiert verbessern, ohne in Grundsatzdebatten stecken zu bleiben.",
    "navTitle": "Datenqualitaet verbessern",
    "visibility": "public",
    "kind": "cluster",
    "helpSlug": "datenqualitaet-verbessern",
    "categoryId": "data-kpis",
    "articleOrder": 3,
    "audience": "Fortgeschrittene",
    "keyTakeaways": [
      "Datenqualitaet ist zuerst ein Priorisierungsproblem.",
      "Ursachen muessen am Prozess ansetzen, nicht nur im Dashboard.",
      "Wenige harte Qualitaetsregeln schaffen schnell Vertrauen."
    ],
    "authorId": "paul-zehm",
    "authorRole": "Gruender",
    "reviewer": "Platform-Team",
    "publishedAt": "2026-03-06",
    "tileBody": "Der Artikel zeigt, wie Teams Datenqualitaetsprobleme systematisch eingrenzen und mit wenig Overhead verbessern.",
    "last_reviewed": "2026-03-06",
    "collection": "bi-guide",
    "categoryOrder": 2,
    "articleNumber": "2.3"
  },
  "body_mdx": "## Warum Datenqualitaet oft falsch angegangen wird ...",
  "internal_links": [],
  "external_sources": [],
  "media_brief": [],
  "quality_notes": []
}
```
