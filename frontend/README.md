# Frontend

The React/Vite frontend contains the ArcGIS map, layers, map tools, Copilot UI, and result visualization. Spatial Copilot requests are sent to the FastAPI backend; set `VITE_GIS_API_URL` in `.env.local` if the backend is not at `http://127.0.0.1:8000`.

Start the frontend with `npm run dev` from this folder. Start the API separately using the instructions in [`../backend/README.md`](../backend/README.md).

This folder contains the React, TypeScript, Vite, and ArcGIS Maps SDK application.

For the complete project guide, including the folder/file map and a “where to change a feature” table, see the [project README](../README.md).

Run the development app from this folder with `npm install` followed by `npm run dev`. Available checks are `npm run build` and `npm run lint`.
