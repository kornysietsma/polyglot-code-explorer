import React from "react";
import ReactDOM from "react-dom";
import "./css/normalize.css";
import "./css/custom.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";

const xhttp = new XMLHttpRequest();
let data = {};
xhttp.onreadystatechange = function() {
    console.log('loaded raw data');
  if (this.readyState === 4 && this.status === 200) {
      console.log('loading app');
    // load up the raw data when it is available
    data = JSON.parse(xhttp.responseText);
    ReactDOM.render(
      <App rawData={data} />,
      document.getElementById("root")
    );
  }
};

const dataFile = process.env.REACT_APP_LATI_DATA || 'default';

xhttp.open("GET", `${process.env.PUBLIC_URL}/data/${dataFile}.json`, true);
xhttp.send();

// ReactDOM.render(<App />, document.getElementById("root"));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
