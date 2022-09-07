import React from "react";

type Props = {
  value: string;
  onChange: (oldValue: string, newValue: string) => void;
  validate?: (oldValue: string, newValue: string) => string | undefined;
};
const DelayedInput = (props: Props) => {
  const { value: origValue, onChange, validate } = props;

  const [value, setValue] = React.useState(origValue);

  const validButton = () => {
    console.log("are we spamming the valid button thing?");
    const errors = validate ? validate(origValue, value) : undefined;
    if (errors != undefined) {
      return (
        <button disabled={true} title={errors}>
          ✓
        </button>
      );
    } else {
      return <button onClick={() => onChange(origValue, value)}>✓</button>;
    }
  };

  return (
    <span className="delayedInput">
      <input
        type="text"
        value={value}
        onChange={(evt) => setValue(evt.target.value)}
      />
      {value == origValue ? null : (
        <span>
          {validButton()}
          <button onClick={() => setValue(origValue)}>✖</button>
        </span>
      )}
    </span>
  );
};

export default DelayedInput;
