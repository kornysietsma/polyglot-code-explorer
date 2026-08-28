# Polyglot Code Explorer

This is the front-end visualisation part of my cross-language polyglot code tools - it allows you to visualise and explore a whole lot of information about a codebase.

For an overview and more documentation, take a look at <https://polyglot.korny.info>

_NOTE_ you will need to use other tools, documented on the site above, to create JSON data files that reflect your own projects!

## WORK IN PROGRESS WARNING

I'm doing a lot of changes right now - if you fetch the current code, things may break.

Especially note, I'm changed the data file formats created by the explorer and used by the scanner - I've added version number checks, but data files from the Scanner must match expectations of the Explorer, so for now it's a bit of "make sure you pull changes often" or things will break.

## Installing and running

You need [Node.js](https://nodejs.org/) 24+ installed (see `.nvmrc`).

Run `npm install` in the project directory to fetch all dependencies.

## Running the explorer

Run `npm start` - a browser window will open on <http://localhost:5173>, loading `data/default.json`.

## Running with a particular data file

Data files live in the top-level `data/` directory (only `data/default.json` is tracked in git -
everything else there is gitignored). To use a different one, set `EXPLORER_DATA` to its name,
without the `.json` extension:

```sh
EXPLORER_DATA=big npm start
```

## Building a static site

`npm run build` produces a self-contained static build in `dist/`, containing the app plus exactly
the one data file named by `EXPLORER_DATA` (or `default.json` if unset). The result works unchanged
whether pushed to a bucket root, served from a GitHub Pages project sub-path, or just unzipped and
served locally - there are lots of ways to run a static web server, but if you have Python
installed it's simple:

```sh
npm run build
cd dist && python3 -m http.server
```

For a discussion of how I use React and D3 together, take a look at [my blog post](https://blog.korny.info/2020/07/19/better-d3-with-react.html) and [demo code](https://github.com/kornysietsma/d3-react-demo)

## Testing

To run the unit tests, `npm test`. To run the Playwright screenshot suite, `npm run e2e`.

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

I have enabled the new-ish flag `noUncheckedIndexedAccess` (see tsconfig.json) so that this is checked. But, sadly, typescript doesn't then like code like:

```js
 if (index < bigColourRange.length) {
        team.colour = bigColourRange[index];
```

So, I'm using a lot of non-null-assertion `!` operators:

```js
 if (index < bigColourRange.length) {
        team.colour = bigColourRange[index]!;
```

and I had to disable the `@typescript-eslint/no-non-null-assertion` check to avoid lots of eslint warnings. I feel this is a valid place for the non-null assertion!

In cases where I'm not confident that the index can never be out of range, I throw an error for clarity:

```js
const colour = bigColourRange[index];
if (colour == undefined) {
  throw new Error("Logic error: invalid colour index");
}
```

For me, this feels like a lesser evil - I'd prefer to be told "hey, this array access might be out of range, please confirm it's OK!" than not. YMMV.
