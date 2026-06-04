import type { ReactElement } from "react";
import { Box, Text, useFocus, useInput } from "ink";

export interface ToggleFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly [string, string];
  onChange: (next: string) => void;
}

/**
 * A two-option switch that joins the form's Tab order via `useFocus`. When
 * focused, ←/→/space flip between the two options. Distinct from the text
 * `Field` so providers read as a toggle rather than free text.
 */
export function ToggleField({ id, label, value, options, onChange }: ToggleFieldProps): ReactElement {
  const { isFocused } = useFocus({ id });
  const [a, b] = options;

  useInput(
    (input, key) => {
      if (key.leftArrow || key.rightArrow || input === " ") {
        onChange(value === a ? b : a);
      }
    },
    { isActive: isFocused },
  );

  const indicator = isFocused ? "▶" : " ";
  const labelProps = isFocused ? { color: "cyan" } : {};

  return (
    <Box>
      <Box width={2}>
        <Text {...labelProps}>{indicator}</Text>
      </Box>
      <Box width={20}>
        <Text {...labelProps}>{label}</Text>
      </Box>
      <Box>
        <Text {...(value === a ? { color: "green" } : {})}>
          {value === a ? "◉" : "○"} {a}
        </Text>
        <Text>{"   "}</Text>
        <Text {...(value === b ? { color: "green" } : {})}>
          {value === b ? "◉" : "○"} {b}
        </Text>
        {isFocused && <Text dimColor>{"   (←/→ to switch)"}</Text>}
      </Box>
    </Box>
  );
}
