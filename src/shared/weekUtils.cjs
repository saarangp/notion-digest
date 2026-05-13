function endOfWeekIso(dateIso) {
  const date = parseIsoDate(dateIso);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? 0 : 7 - day));
  return toIsoDate(date);
}

function isUpcomingThisWeek(dateIso, todayIso) {
  return Boolean(dateIso && dateIso > todayIso && dateIso <= endOfWeekIso(todayIso));
}

function parseIsoDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = {
  endOfWeekIso,
  isUpcomingThisWeek,
};
