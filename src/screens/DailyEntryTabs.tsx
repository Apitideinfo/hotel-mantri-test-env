import { RoomChart } from '@/screens/RoomChart';

interface DailyEntryTabsProps {
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

export const DailyEntryTabs = ({ date, onBack, onSaved }: DailyEntryTabsProps) => {
  return (
    <div className="min-h-screen bg-slate-50">
      <RoomChart date={date} onBack={onBack} onSaved={onSaved} />
    </div>
  );
};
