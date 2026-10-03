import { Link } from "react-router";
import styles from "./PageNavigation.module.css";

type PageNavigationProps = {
  label: string;
  links: { to: string; text: string }[];
};

export const PageNavigation = ({ label, links }: PageNavigationProps) => (
  <nav className={styles.navigation} aria-label={label}>
    {links.map(({ to, text }) => (
      <Link key={to} className={styles.link} to={to}>{text}</Link>
    ))}
  </nav>
);
