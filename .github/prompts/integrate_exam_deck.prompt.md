---
description: "Integrate the extracted Pattern Recognition exam CSV and images into the existing flashcard viewer"
argument-hint: "Update the flashcard app to load the exam deck and expose the CSV/ZIP downloads"
agent: "agent"
---
You are working in this repo:
- [index.html](index.html)
- [app.js](app.js)
- [styles.css](styles.css)
- [README.md](README.md)

The generated exam artifacts are already in the repo as static files:
- [pr_mock2526_solution_questions.csv](pr_mock2526_solution_questions.csv)
- [pr_mock2526_solution_images.zip](pr_mock2526_solution_images.zip)
- [page2_figure1.png](page2_figure1.png)

Task
- Update the existing flashcard viewer to show the Pattern Recognition exam content that is already present in the repo.
- Do not build a CSV import flow or ZIP upload/import flow.
- Treat the CSV and ZIP as repo assets only. The UI should display the deck content and expose the files as static links or downloads.
- Keep the current flashcard experience intact unless a small UI change is needed to present the exam deck clearly.
- Add a simple, visible resources area in the UI that points to the CSV, ZIP, and extracted image file.
- Keep the solution fully static. No backend.

Implementation guidance
- Use the existing app structure, but update [app.js](app.js) so it can render the exam deck content from the CSV already committed in the repo, not from an external upload.
- Support these columns from [pr_mock2526_solution_questions.csv](pr_mock2526_solution_questions.csv):
  - Question Number
  - Question Type
  - Question Text
  - Question Image File
  - Option A through Option F
  - Options Image Files
  - Correct Answer
  - Explanation A through Explanation F
- Render the question content on the front of the card and the correct answer on the back.
- For the exam deck, support questions with up to six options.
- If a row references an image file, render it from a static path in the repo.
- Keep the current search/filter/progress mechanics working if possible.
- Update [index.html](index.html) and [styles.css](styles.css) only as needed for the new resources panel and layout.
- Update [README.md](README.md) only if the static file usage changes.

Expected result
- The app shows the Pattern Recognition exam deck using the static CSV already in the repo.
- The CSV, ZIP, and extracted image are visible or downloadable from the page as static repo assets.
- The UI still feels like the same app, not a rebuild.

If you need to choose a file structure, prefer a simple static layout and keep all new paths explicit and easy to maintain. Do not add any runtime asset-import feature.