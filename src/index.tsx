import "./css/normalize.css";
import "./css/custom.scss";

import { createRoot } from "react-dom/client";
import ReactModal from "react-modal";

import Loader from "./Loader";
import reportWebVitals from "./reportWebVitals";

const container = document.getElementById("root");
if (!container) {
  throw new Error("No root container element!");
}
const root = createRoot(container);

root.render(<Loader />);

ReactModal.setAppElement("#root");

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
