// הגדרת ההרגלים של האתגר
const HABITS = [
  { id: 'no_alcohol', label: 'בלי אלכוהול', icon: '🚫🍺', days: null },
  { id: 'no_smoking', label: 'בלי עישון (מכל סוג)', icon: '🚭', days: null },
  { id: 'running', label: 'ריצה (יעד: יום כן יום לא)', icon: '🏃', days: null }, // כל יום פתוח לסימון, הקצב הרצוי הוא כל יומיים
  { id: 'stretching', label: 'תרגילי שחרור גוף', icon: '🧘', days: null },
  { id: 'sleep', label: 'שינה לפני 00:00', icon: '😴', days: null },
  { id: 'water', label: 'שתיית מים (לפחות 1 ליטר)', icon: '💧', days: null },
];

function habitAppliesOn(habit, date) {
  if (!habit.days) return true;
  return habit.days.includes(date.getDay());
}

function habitsForDate(date) {
  return HABITS.filter((h) => habitAppliesOn(h, date));
}
