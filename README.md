# Polyglot Code Explorer

This is the front-end visualisation part of my cross-language polyglot code tools - it allows you to visualise and explore a whole lot of information about a codebase.

For an overview and more documentation, take a look at <https://polyglot.korny.info>

*NOTE* you will need to use other tools, documented on the site above, to create JSON data files that reflect your own projects!

## WORK IN PROGRESS WARNING

I'm doing a lot of changes right now - if you fetch the current code, things may break.

Especially note, I'm changed the data file formats created by the explorer and used by the scanner - I've added version number checks, but data files from the Scanner must match expectations of the Explorer, so for now it's a bit of "make sure you pull changes often" or things will break.

## Installing and running

You can run with node.js (see below) - or you can grab a compiled static site and run it yourself.

### Running from a static release

See also <https://polyglot.korny.info/tools/explorer/howto> for more detailed instructions

Static releases are published to <https://github.com/kornysietsma/polyglot-code-explorer/releases>

These are published as a static site - you can run them by:

- Download the zip file from the latest release
- Unzip it somewhere
- Optionally copy your own JSON data file over `data/default.json`
- Load the static site in your favourite static web server

There are quite a ways to run a static web server locally - many people have python pre-installed, in which case you can run a simple web server very easily:

```sh
# Check python version
python -V
# If Python version returned above is 3.X
python3 -m http.server
# On windows try "python" instead of "python3", or "py -3"
# If Python version returned above is 2.X
python -m SimpleHTTPServer
```

### Running using node.js

You need node.js installed, currently tested on node 14.5.0 though it may well work on older or newer versions.

You need `yarn` installed - see <https://classic.yarnpkg.com/en/docs/install>

run `yarn install` in the project directory to fetch all dependencies.

## Running the explorer

You can run with the default data file by running `yarn run` - a browser window will open on <http://localhost:3000>

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

```sh
REACT_APP_EXPLORER_DATA=big yarn start
```

or if you don't want to re-open the browser:

```sh
REACT_APP_EXPLORER_DATA=big BROWSER=none yarn start
```

For a discussion of how I use React and D3 together, take a look at [my blog post](https://blog.korny.info/2020/07/19/better-d3-with-react.html) and [demo code](https://github.com/kornysietsma/d3-react-demo)

This was created using Create-React-App and hasn't been "ejected" yet so you can upgrade react versions and the like.  You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

## Testing

To run tests, `yarn test`

I have hardly any tests - mostly as this started as all UI code with little logic, and frankly the effort for UI testing on a rapidly changing pet project just didn't seem worth the benefits.

I'm finally adding some tests now, but mostly around pure JavaScript logic which is
easy to test - and initially, just where I'm doing something new, and complex, and especially where I find bugs.

I'm a huge fan of proper testing for code that anyone depends on day-to-day - if someone wants to fund me to quit my job and write a comprehensive test suite, I'd be very happy!

## A note on typescript and eslint checks

I found, after some digging, that Typescript by default doesn't check or warn you
if you access an array with a possibly out-of-range index:

```js
function last(days: number[]): number {
    return days.sort((a, b) => b - a)[0];
}
last([]); // undefined!
```

There's a lot of discussion [here](https://stackoverflow.com/questions/50647399/typescript-accessing-an-array-element-does-not-account-for-the-possibility-of-u)

I have enabled the new-ish flag `noUncheckedIndexedAccess` (see tsconfig.json) so that this is checked.  But, sadly, typescript doesn't then like code like:

```js
 if (index < bigColourRange.length) {
        team.colour = bigColourRange[index];
```

So, I'm using a lot of non-null-assertion `!` operators:

```js
 if (index < bigColourRange.length) {
        team.colour = bigColourRange[index]!;
```

and I had to disable the `@typescript-eslint/no-non-null-assertion` check to avoid lots of eslint warnings.  I feel this is a valid place for the non-null assertion!

In cases where I'm not confident that the index can never be out of range, I throw an error for clarity:

```js
    const colour = bigColourRange[index];
    if (colour == undefined) {
        throw new Error("Logic error: invalid colour index");
    }
```

For me, this feels like a lesser evil - I'd prefer to be told "hey, this array access might be out of range, please confirm it's OK!" than not.  YMMV.
