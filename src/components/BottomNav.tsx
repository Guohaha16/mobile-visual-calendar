import { CalendarDays, LibraryBig, Plus } from "lucide-react";

import type { AppRoute } from "../app/routes";
import { FrostedIconButton } from "./FrostedIconButton";
import styles from "./BottomNav.module.css";

interface BottomNavProps {
  activeView: AppRoute["view"];
  onAdd: () => void;
  onCalendar: () => void;
  onShelf: () => void;
}

export function BottomNav({
  activeView,
  onAdd,
  onCalendar,
  onShelf,
}: BottomNavProps) {
  return (
    <nav aria-label="Primary" className={styles.nav}>
      <FrostedIconButton
        active={activeView === "shelf"}
        current={activeView === "shelf"}
        icon={LibraryBig}
        label="Bookshelf"
        onClick={onShelf}
      />
      <FrostedIconButton
        className={styles.add}
        icon={Plus}
        label="Add diary entry"
        onClick={onAdd}
      />
      <FrostedIconButton
        active={activeView === "calendar"}
        current={activeView === "calendar"}
        icon={CalendarDays}
        label="Calendar"
        onClick={onCalendar}
      />
    </nav>
  );
}
