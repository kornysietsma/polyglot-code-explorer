// The one place the app renders a failure to the user. Both the load-time errors `Loader`
// collects and the render-time errors `ErrorBoundary` catches come through here, so a crash
// halfway through using the app looks like a crash while loading it.
const ErrorReport = ({
  title,
  lines,
  detail,
}: {
  title: string;
  lines: string[];
  detail?: string | undefined;
}) => (
  <div>
    <h1>{title}</h1>
    <ul>
      {lines.map((line, ix) => (
        <li key={ix}>{line}</li>
      ))}
    </ul>
    {detail === undefined ? null : <pre>{detail}</pre>}
  </div>
);

export default ErrorReport;
