import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
if (window.CinemaNative)
  document
    .querySelector('meta[name="viewport"]')
    .setAttribute("content", "width=1280");
createRoot(document.getElementById("root")).render(<App />);
