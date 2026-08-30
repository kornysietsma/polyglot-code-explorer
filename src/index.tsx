import "./css/normalize.css";
import "./css/custom.scss";

import { createRoot } from "react-dom/client";
import ReactModal from "react-modal";

import { registerGlobalErrorHandlers } from "./globalErrorHandlers";
import Loader from "./Loader";

registerGlobalErrorHandlers();

const container = document.getElementById("root");
if (!container) {
  throw new Error("No root container element!");
}
const root = createRoot(container);

root.render(<Loader />);

ReactModal.setAppElement("#root");
