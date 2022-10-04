import { useCallback, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import useDebouncy from "use-debouncy/lib/fn";
import useOnClickOutside from "use-onclickoutside";

export const ColourPicker = ({
  colour,
  onChange,
}: {
  colour: string;
  onChange: (newColour: string) => void;
}) => {
  const popover = useRef<HTMLDivElement>(null);
  const [isOpen, toggle] = useState(false);

  const close = useCallback(() => toggle(false), []);
  useOnClickOutside(popover, close);

  const handleChange = useDebouncy(
    (newColour: string) => onChange(newColour),
    200
  );

  return (
    <div className="picker">
      <div
        className="swatch"
        style={{ backgroundColor: colour }}
        onClick={() => toggle(true)}
      />

      {isOpen && (
        <div className="popover" ref={popover}>
          <HexColorPicker color={colour} onChange={handleChange} />
        </div>
      )}
    </div>
  );
};
