import { render } from "@testing-library/react";
import React from "react";

import Loader from "./Loader";

test("renders without crashing", () => {
  const { getByText } = render(<Loader />);
  const linkElement = getByText(/polyglot/i);
  expect(linkElement).toBeInTheDocument();
});
