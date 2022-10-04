import React, { useId } from "react";

type Props = {
  value: number;
  minValue: number;
  maxValue: number;
  label: string;
  postLabel?: (value: number) => string;
  onChange: (oldValue: number, newValue: number) => void;
};
const DelayedInputRange = (props: Props) => {
  const {
    value: origValue,
    minValue,
    maxValue,
    onChange,
    label,
    postLabel,
  } = props;

  const [value, setValue] = React.useState(origValue);

  const inputId = useId();

  const validButton = () => {
    return (
      <button onClick={() => onChange(origValue, value)} title="apply">
        ✓
      </button>
    );
  };

  function approxEq(a: number, b: number) {
    return Math.abs(b - a) < 0.001;
  }

  return (
    <label htmlFor={inputId} className="delayedInputRange">
      {label}
      <input
        type="range"
        id={inputId}
        min={minValue}
        max={maxValue}
        value={value}
        onChange={(evt) => setValue(parseFloat(evt.target.value))}
      />
      {approxEq(value, origValue) ? null : (
        <span>
          {validButton()}
          <button onClick={() => setValue(origValue)}>✖</button>
        </span>
      )}
      {postLabel ? postLabel(value) : ""}
    </label>
  );
};

export default DelayedInputRange;
