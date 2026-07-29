import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import styles from "./FrostedIconButton.module.css";

interface FrostedIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  icon: LucideIcon;
  label: string;
}

export function FrostedIconButton({
  active = false,
  className,
  icon: Icon,
  label,
  type = "button",
  ...buttonProps
}: FrostedIconButtonProps) {
  const classes = [styles.button, active ? styles.active : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      aria-label={label}
      aria-pressed={active}
      className={classes}
      title={label}
      type={type}
    >
      <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
    </button>
  );
}
