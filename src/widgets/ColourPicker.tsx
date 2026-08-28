import { useCallback, useRef, useState } from "react";
import { useInteractOutside } from "react-aria";
import { HexColorPicker } from "react-colorful";
import { useDebouncyFn } from "use-debouncy";

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
  useInteractOutside({ ref: popover, onInteractOutside: close });

  const handleChange = useDebouncyFn(
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
