const { getDb } = require('../../database/db');

const parseMonths = (value, fallback = 6) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(Math.max(numeric, 1), 24);
};

const getAnalyticsCollection = () => getDb().collection('bookings');

const getBookingAnalyticsOverview = async ({ months = 6 } = {}) => {
  const monthsWindow = parseMonths(months, 6);
  const fromDate = new Date();
  fromDate.setUTCMonth(fromDate.getUTCMonth() - monthsWindow);
  fromDate.setUTCHours(0, 0, 0, 0);

  const pipeline = [
    {
      $match: {
        createdAt: { $gte: fromDate }
      }
    },
    {
      $lookup: {
        from: 'hotels',
        localField: 'hotelId',
        foreignField: '_id',
        as: 'hotel'
      }
    },
    {
      $unwind: {
        path: '$hotel',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        checkInDate: {
          $dateFromString: {
            dateString: '$checkIn',
            format: '%Y-%m-%d',
            onError: null,
            onNull: null
          }
        },
        checkOutDate: {
          $dateFromString: {
            dateString: '$checkOut',
            format: '%Y-%m-%d',
            onError: null,
            onNull: null
          }
        }
      }
    },
    {
      $addFields: {
        rawNights: {
          $cond: [
            {
              $and: [
                { $ne: ['$checkInDate', null] },
                { $ne: ['$checkOutDate', null] }
              ]
            },
            {
              $divide: [
                { $subtract: ['$checkOutDate', '$checkInDate'] },
                86400000
              ]
            },
            1
          ]
        }
      }
    },
    {
      $addFields: {
        nights: { $max: [1, { $ceil: '$rawNights' }] },
        pricePerNight: { $ifNull: ['$hotel.price_per_night', 0] },
        hotelTitle: { $ifNull: ['$hotel.title', 'Unknown hotel'] },
        hotelLocation: { $ifNull: ['$hotel.location', 'Unknown'] },
        month: {
          $dateToString: {
            format: '%Y-%m',
            date: '$createdAt'
          }
        },
        isConfirmed: { $eq: ['$status', 'confirmed'] },
        isCancelled: { $eq: ['$status', 'cancelled'] }
      }
    },
    {
      $addFields: {
        estimatedAmount: { $multiply: ['$nights', '$pricePerNight'] }
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              confirmedBookings: {
                $sum: {
                  $cond: ['$isConfirmed', 1, 0]
                }
              },
              cancelledBookings: {
                $sum: {
                  $cond: ['$isCancelled', 1, 0]
                }
              },
              estimatedRevenue: {
                $sum: {
                  $cond: ['$isConfirmed', '$estimatedAmount', 0]
                }
              }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: '$month',
              bookings: { $sum: 1 },
              confirmedBookings: {
                $sum: {
                  $cond: ['$isConfirmed', 1, 0]
                }
              },
              estimatedRevenue: {
                $sum: {
                  $cond: ['$isConfirmed', '$estimatedAmount', 0]
                }
              }
            }
          },
          { $sort: { _id: 1 } }
        ],
        topHotels: [
          {
            $group: {
              _id: '$hotelId',
              hotelTitle: { $first: '$hotelTitle' },
              hotelLocation: { $first: '$hotelLocation' },
              bookings: { $sum: 1 },
              confirmedBookings: {
                $sum: {
                  $cond: ['$isConfirmed', 1, 0]
                }
              },
              estimatedRevenue: {
                $sum: {
                  $cond: ['$isConfirmed', '$estimatedAmount', 0]
                }
              }
            }
          },
          { $sort: { confirmedBookings: -1, estimatedRevenue: -1 } },
          { $limit: 5 }
        ],
        byCity: [
          {
            $group: {
              _id: '$hotelLocation',
              bookings: { $sum: 1 },
              estimatedRevenue: {
                $sum: {
                  $cond: ['$isConfirmed', '$estimatedAmount', 0]
                }
              }
            }
          },
          { $sort: { bookings: -1, estimatedRevenue: -1 } },
          { $limit: 6 }
        ]
      }
    }
  ];

  const [result] = await getAnalyticsCollection().aggregate(pipeline).toArray();

  const summary = result?.summary?.[0] || {
    totalBookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    estimatedRevenue: 0
  };

  return {
    monthsWindow,
    fromDate,
    summary,
    byMonth: result?.byMonth || [],
    topHotels: result?.topHotels || [],
    byCity: result?.byCity || []
  };
};

module.exports = {
  getBookingAnalyticsOverview
};
