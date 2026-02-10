const parsePositiveInt = (value, fallback) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }
  return number;
};

const getPagination = ({ page, limit, defaultLimit, maxLimit }) => {
  const parsedPage = parsePositiveInt(page, 1);
  const parsedLimit = Math.min(parsePositiveInt(limit, defaultLimit), maxLimit);
  const skip = (parsedPage - 1) * parsedLimit;

  return {
    page: parsedPage,
    limit: parsedLimit,
    skip
  };
};

const getPaginationMeta = ({ total, page, limit }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null
  };
};

module.exports = {
  getPagination,
  getPaginationMeta
};
