# Polyglot Code Explorer

This is the front-end visualisation part of my cross-language polyglot code tools - it allows you to visualise and explore a whole lot of information about a codebase.

For an overview and more documentation, take a look at <https://polyglot.korny.info>

*NOTE* you will need to use other tools, documented on the site above, to create JSON data files that reflect your own projects!

## Installing and running

You need node.js installed, currently tested on node 14.5.0 though it may well work on older or newer versions.

You need `yarn` installed - see <https://classic.yarnpkg.com/en/docs/install>

run `yarn install` in the project directory to fetch all dependencies.

## Running the explorer

You can run with the default data file by running `yarn run` - a browser window will open on http://localhost:3000

## Running with a particular data file

Initially I had data files in `src/data/flare.json` loaded with

```js
import rawData from "./data/flare.json";
```

This works, but it doesn't work well if you want to change data files at run-time.

Now, instead it looks for a file in `public/data/default.json` and loads it via an `xmlhttprequest` in `index.js`

If you want a different file, set `REACT_APP_EXPLORER_DATA` with the file prefix (ignoring the `.json` part) - create-react-app
will pass variables starting `REACT_APP_` to the app, so `index.js` can read it and load the right file.

For example:

```shell script
REACT_APP_EXPLORER_DATA=big yarn start
```

or if you don't want to re-open the browser:
```shell script
REACT_APP_EXPLORER_DATA=big BROWSER=none yarn start
```

For a discussion of how I use React and D3 together, take a look at [my blog post](https://blog.korny.info/2020/07/19/better-d3-with-react.html) and [demo code](https://github.com/kornysietsma/d3-react-demo)


This was created using Create-React-App and hasn't been "ejected" yet so you can upgrade react versions and the like.  You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).
