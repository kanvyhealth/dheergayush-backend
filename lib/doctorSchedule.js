const { convertToMinutes } = require('./doctorAvailability');

const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '17:00',
  slotDuration: 30
};

const DEFAULT_WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_WORKING_DAYS_INT = [1, 2, 3, 4, 5, 6, 7];

const DAY_NAME_TO_WEEKDAY = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7
};

function workingDaysToAppFormat(days) {
  const source = Array.isArray(days) && days.length ? days : DEFAULT_WORKING_DAYS;
  const parsed = source
    .map((day) => {
      if (typeof day === 'number') {
        return day >= 1 && day <= 7 ? day : null;
      }
      const asInt = parseInt(String(day), 10);
      if (!Number.isNaN(asInt) && asInt >= 1 && asInt <= 7) {
        return asInt;
      }
      return DAY_NAME_TO_WEEKDAY[String(day || '').trim().toLowerCase()] || null;
    })
    .filter((day) => day != null);

  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : [...DEFAULT_WORKING_DAYS_INT];
}

function minutesTo24h(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseAvailableTimeToWorkingHours(availableTime) {
  const raw = String(availableTime || '').trim();
  if (!raw) {
    return { ...DEFAULT_WORKING_HOURS };
  }

  const separator = raw.includes(' to ') ? ' to ' : raw.includes('-') ? '-' : null;
  if (!separator) {
    return { ...DEFAULT_WORKING_HOURS };
  }

  const [startPart, endPart] = raw.split(separator).map((s) => s.trim());
  const startMinutes = convertToMinutes(startPart);
  const endMinutes = convertToMinutes(endPart);
  if (startMinutes === 0 && endMinutes === 0) {
    return { ...DEFAULT_WORKING_HOURS };
  }

  return {
    start: minutesTo24h(startMinutes),
    end: minutesTo24h(endMinutes > startMinutes ? endMinutes : startMinutes + 480),
    slotDuration: 30
  };
}

module.exports = {
  DEFAULT_WORKING_DAYS,
  DEFAULT_WORKING_DAYS_INT,
  DEFAULT_WORKING_HOURS,
  parseAvailableTimeToWorkingHours,
  workingDaysToAppFormat
};