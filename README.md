# Korny's d3 react playground

This is the base project for my react-ising my d3 visualizations.

A few key concepts:

I'm using the approach that D3 owns it's own DOM area - based on the excellent article at https://towardsdatascience.com/react-d3-the-macaroni-and-cheese-of-the-data-visualization-world-12bafde1f922 but with updating to use react hooks, and a few other bits I've pilfered from elsewhere.

So React manipulates everything HTML, D3 manipulates everything SVG.

 Basically there's a single `<svg>` element in the Viz.js component, and it is owned and manipulated through the `useEffect` calls, rather than trying to let react manage it's DOM.

 I'm using a `ref` to keep track of the svg root across re-renderings - as I understand React, this should hang around even if we manipulate stuff elsewhere.

State is kept in three broad areas, based on my experiences of what I need for D3:

- The main data is kept in a `ref` as well - they aren't just for DOM elements! The data could be in my state, but then React would need to keep diffing it to see if it has changed - and in many cases the data can be very large, and it's more efficient to keep it effectively global, and track changes myself.

- Configuration that can change, but requires a complete re-render of the D3 visualization, lives in `state.expensiveConfig` - it's useful to keep this separate because rebuilding things like d3 hierarchies, or running filters across the whole of your dataset, can be quite expensive; you sometimes need this but not on every user interaction

- Configuration that just changes visual effects lives in `state.config` - this tells D3 to re-render the visualization, but not do any up-front calculations.

The expensive config should usually be behind a "submit" button or something, so it happens when the user chooses.  The cheap config can be behind onChange, mouse events and the like - it should be able to change quite quickly.  (unless I have things wrong - d3 change can be fiddly, and I'm writing most of this in snatches between toddler interventions).  ~Viz has two `useEffect` calls, one is triggered on expensive change, one on cheap change.~ - turns out that doesn't work well!  Instead, now Viz has a single `useEffect` which compares the old and new state, to work out if an expensive re-render or a cheap re-draw is best.

see https://stackoverflow.com/questions/53446020/how-to-compare-oldvalues-and-newvalues-on-react-hooks-useeffect for some background on this.

(Note: the sample uses code I copied from elsewhere, which doesn't clean up nicely, so it's a bit flakey with `tick` calls - don't look too closely!)

The general lifecycle of the app is:

* `App` renders the initial page, the Controller and Viz components, and sets up wiring
* `Viz` renders the `<svg>` element, and wires up the `useEffect` call
* `useEffect` is triggered and calls `draw` as the config is new
* The d3 scales and simulation are set up in `draw`
* then the bubbles are drawn

On a UI triggered change:
* All the components get re-rendered, cheaply, as that's what React does.  DOM diffing means nothing is actually drawn
* The Controller calls the `dispatch` function, which processes a payload and modifies the `state`
* The Viz `useEffect` is triggered
* The previous and current state contents are compared - if the change is to expensive state, the full D3 simulation is re-built.  If it is to cheap state only, just the bubbles are redrawn.



---- original create-react-app stuff below ----

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.<br />
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br />
You will also see any lint errors in the console.

### `yarn test`

Launches the test runner in the interactive watch mode.<br />
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `yarn build`

Builds the app for production to the `build` folder.<br />
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br />
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (Webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: https://facebook.github.io/create-react-app/docs/code-splitting

### Analyzing the Bundle Size

This section has moved here: https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size

### Making a Progressive Web App

This section has moved here: https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app

### Advanced Configuration

This section has moved here: https://facebook.github.io/create-react-app/docs/advanced-configuration

### Deployment

This section has moved here: https://facebook.github.io/create-react-app/docs/deployment

### `yarn build` fails to minify

This section has moved here: https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify
