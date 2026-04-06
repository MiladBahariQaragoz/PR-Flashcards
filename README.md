# Flashcards

Simple no-database flashcard web app for Vercel.

## What it does

- Loads both [flashcards.csv](flashcards.csv) and [pr_mock2526_solution_questions.csv](pr_mock2526_solution_questions.csv).
- Prompts for a name on first visit.
- Saves progress separately for each name in browser `localStorage`.
- Uses `EX 1`, `EX 2`, etc. contexts for flashcards and `mock exam` for exam questions.
- Shows flashcards in flip-card mode and mock exam questions in MCQ mode.
- Reveals the MCQ answer and explanations after a question is answered.
- Lets users mark cards as known or review later.
- Supports filtering by context and search across both datasets.
- Shows a resources panel with static links to the CSV, image ZIP, and extracted example image.

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Leave the project as a static site. No database or backend is required.

## Vercel Analytics

This repository now includes Vercel Analytics for static deployment via:

- [index.html](index.html): loads `/_vercel/insights/script.js`
- [package.json](package.json): includes `@vercel/analytics`

If you later migrate this app to Next.js (React), use:

```tsx
import { Analytics } from "@vercel/analytics/next";
```

Then render `<Analytics />` in your root layout.

## Local preview

If you want to preview locally, use any static file server from this folder so both CSV files can be fetched correctly.
