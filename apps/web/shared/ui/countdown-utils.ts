export const getOneMonthFromNow = (): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date;
};

export const createDiscountEndDate = (): Date => {
  const now = new Date();
  return new Date(now.getTime() + 15 * 60 * 1000);
};
