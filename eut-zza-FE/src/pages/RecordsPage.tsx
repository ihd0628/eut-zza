import { MyRecords } from "../components/MyRecords";
import { PageNavigation } from "./PageNavigation";

export const RecordsPage = () => (
  <>
    <PageNavigation label="기록 화면 이동" links={[{ to: "/", text: "← 모드 선택으로" }]} />
    <MyRecords />
  </>
);
