// this seems needed to get typescript, react and css modules to play nicely. sigh.
// see https://stackoverflow.com/questions/58380082/create-react-app-typescript-css-modules-auto-generating-type-definitions-wi

declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}
