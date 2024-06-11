import * as Temporal from '../../polyfill/lib/temporal.mjs';
import ICAL from 'ical.js';

// The time zone can either be a named IANA time zone (in which case everything
// works just like Temporal.ZonedDateTime) or an iCalendar rule-based time zone
class ZonedDateTime {
  #impl;
  #timeZone;
  #isIANA;

  // These properties allow the object to be used as a PlainDateTime property
  // bag if the time zone isn't IANA
  era;
  eraYear;
  year;
  month;
  monthCode;
  day;
  hour;
  minute;
  second;
  millisecond;
  microsecond;
  nanosecond;
  calendar;

  // This property additionally allows the object to be used as a ZonedDateTime
  // property bag if the time zone is IANA
  timeZone;

  constructor(epochNs, timeZone, calendar = 'iso8601') {
    this.#timeZone = timeZone;
    this.#isIANA = Intl.supportedValuesOf('timeZone').includes(timeZone.tzid);
    this.#impl = new Temporal.ZonedDateTime(epochNs, this.#isIANA ? this.#timeZone.tzid : 'UTC', calendar);

    // Define public property-bag properties
    if (this.#isIANA) {
      this.timeZone = timeZone.tzid;
    }
    this.calendar = calendar;

    const pdt = this.toPlainDateTime();
    this.era = pdt.era;
    this.eraYear = pdt.eraYear;
    this.year = pdt.year;
    this.month = pdt.month;
    this.monthCode = pdt.monthCode;
    this.day = pdt.day;
    this.hour = pdt.hour;
    this.minute = pdt.minute;
    this.second = pdt.second;
    this.millisecond = pdt.millisecond;
    this.microsecond = pdt.microsecond;
    this.nanosecond = pdt.nanosecond;
  }

  // For now, from() only clones; semantics of deserialization from string are
  // yet to be defined
  static from(item) {
    return new ZonedDateTime(item.#impl.epochNanoseconds, item.#timeZone, item.#impl.calendarId);
  }

  // Use this method instead of Instant.prototype.toZonedDateTimeISO()
  static fromInstant(instant, timeZone, calendar = 'iso8601') {
    return new ZonedDateTime(instant.epochNanoseconds, timeZone, calendar);
  }

  // Use this method instead of PlainDateTime.prototype.toZonedDateTime() and
  // PlainDate.prototype.toZonedDateTime()
  static fromPlainDateTime(pdt, timeZone, options) {
    if (timeZone.tzid) {
      const temporalZDT = pdt.toZonedDateTime(timeZone.tzid, options);
      return new ZonedDateTime(temporalZDT.epochNanoseconds, timeZone, pdt.calendarId);
    }
    const icalTime = new ICAL.Time(pdt, timeZone);
    const epochSeconds = icalTime.toUnixTime(); // apply disambiguation parameter?
    const epochNanoseconds =
      BigInt(epochSeconds) * 1000000000n + BigInt(pdt.millisecond * 1e6 + pdt.microsecond * 1e3 + pdt.nanosecond);
    return new ZonedDateTime(epochNanoseconds, timeZone, pdt.calendarId);
  }

  static compare(a, b) {
    return Temporal.ZonedDateTime.compare(a.#impl, b.#impl);
  }

  toPlainDateTime() {
    if (this.#isIANA) {
      return this.#impl.toPlainDateTime();
    }
    return this.#impl.toPlainDateTime().add({ nanoseconds: this.offsetNanoseconds });
  }

  get offsetNanoseconds() {
    if (this.#isIANA) {
      return this.#impl.offsetNanoseconds;
    }
    const epochSeconds = Math.floor(this.#impl.epochMilliseconds / 1000);
    const utcTime = new ICAL.Time();
    utcTime.fromUnixTime(epochSeconds);
    const time = utcTime.convertToZone(this.#timeZone);
    const offsetSeconds = this.#timeZone.utcOffset(time);
    return offsetSeconds * 1e9;
  }

  // similar to the other xOfY properties, only showing one for the example
  get dayOfWeek() {
    return this.toPlainDateTime().dayOfWeek;
  }
  // ...get dayOfYear(), etc. omitted because they are very similar to the above

  #isoDateTimePartString(n) {
    return String(n).padStart(2, '0');
  }

  get offset() {
    const offsetNs = this.offsetNanoseconds;
    const sign = offsetNs < 0 ? '-' : '+';
    const absoluteNs = Math.abs(offsetNs);
    const hour = Math.floor(absoluteNs / 3600e9);
    const minute = Math.floor(absoluteNs / 60e9) % 60;
    const second = Math.floor(absoluteNs / 1e9) % 60;
    let result = `${sign}${this.#isoDateTimePartString(hour)}:${this.#isoDateTimePartString(minute)}`;
    if (second === 0) {
      return result;
    }
    result += `:${this.#isoDateTimePartString(second)}`;
    return result;
  }

  get epochMilliseconds() {
    return this.#impl.epochMilliseconds;
  }

  get epochNanoseconds() {
    return this.#impl.epochNanoseconds;
  }

  // PlainTime property bag and string arguments omitted for brevity
  withPlainTime(time) {
    const pdt = this.toPlainDateTime();
    return ZonedDateTime.fromPlainDateTime(pdt.withPlainTime(time), this.#timeZone);
  }

  withCalendar(calendar) {
    return new ZonedDateTime(this.#impl.epochNanoseconds, this.#timeZone, calendar);
  }

  withTimeZone(timeZone) {
    return new ZonedDateTime(this.#impl.epochNanoseconds, timeZone, this.#impl.calendarId);
  }

  // Not currently implemented, for brevity: duration property bag and duration
  // string inputs
  add(duration, options) {
    if (
      this.#isIANA ||
      (duration.years === 0 && duration.months === 0 && duration.weeks === 0 && duration.days === 0)
    ) {
      const temporalZDT = this.#impl.add(duration, options);
      return new ZonedDateTime(temporalZDT.epochNanoseconds, this.#timeZone, this.#impl.calendarId);
    }
    const pdt = this.toPlainDateTime().add(
      {
        years: duration.years,
        months: duration.months,
        weeks: duration.weeks,
        days: duration.days
      },
      options
    );
    const intermediate = ZonedDateTime.fromPlainDateTime(pdt, this.#timeZone, { disambiguation: 'compatible' });
    return intermediate.add(
      Temporal.Duration.from({
        hours: duration.hours,
        minutes: duration.minutes,
        seconds: duration.seconds,
        milliseconds: duration.milliseconds,
        microseconds: duration.microseconds,
        nanoseconds: duration.nanoseconds
      })
    );
  }

  // Not currently implemented, for brevity: property bag and string inputs;
  // plural forms of largestUnit
  // largestUnit > "hours" is also not currently implemented because that would
  // require semantics for equality of two ICAL.Timezone instances (see the note
  // about equals() below)
  until(other, options) {
    const { largestUnit = 'hour' } = options ?? {};
    if (largestUnit === 'year' || largestUnit === 'month' || largestUnit === 'week' || largestUnit === 'day') {
      throw new Error('not implemented');
    }
    return this.#impl.until(other.#impl, options);
  }

  startOfDay() {
    const pdt = this.toPlainDateTime();
    const midnight = Temporal.PlainTime.from('00:00');
    return ZonedDateTime.fromPlainDateTime(pdt.withPlainTime(midnight), this.#timeZone, {
      disambiguation: 'compatible'
    });
  }

  toInstant() {
    return this.#impl.toInstant();
  }

  toPlainDate() {
    return this.toPlainDateTime().toPlainDate();
  }

  toPlainTime() {
    return this.toPlainDateTime().toPlainTime();
  }

  valueOf() {
    throw new TypeError();
  }

  // Methods that are not implemented, and why:
  // Semantics for equality of ICAL.Timezone not defined, so omitting this
  // method for now, as its semantics would need to be better defined
  equals(other) {
    if (this.#isIANA && other.#isIANA) {
      return this.#impl.equals(other.#impl);
    }
    throw new Error('not implemented');
  }

  // Not currently implemented, for brevity
  with(zonedDateTimeLike, options) {
    if (this.#isIANA) {
      const temporalZDT = this.#impl.with(zonedDateTimeLike, options);
      return new ZonedDateTime(temporalZDT.epochNanoseconds, this.#timeZone, this.#impl.calendarId);
    }
    throw new Error('not implemented');
  }

  // Not currently implemented, for brevity
  round(options) {
    if (this.#isIANA) {
      return this.#impl.round(options);
    }
    throw new Error('not implemented');
  }

  // ICAL.Timezone doesn't yet have a method for fetching prev/next transition,
  // so omitting this method for now
  getTimeZoneTransition(direction) {
    if (this.#isIANA) {
      const temporalZDTorNull = this.#impl.getTimeZoneTransition(direction);
      if (temporalZDTorNull === null) {
        return null;
      }
      return new ZonedDateTime(temporalZDTorNull.epochNanoseconds, this.#timeZone, this.#impl.calendarId);
    }
    throw new Error('not implemented');
  }

  // Omitting these three convert-to-string methods for now, semantics of
  // (de)serialization are yet to be defined. Would also need to figure out how
  // to get localized output for toLocaleString() in particular.
  toLocaleString(locales, options) {
    if (this.#isIANA) {
      return this.#impl.toLocaleString(locales, options);
    }
    throw new Error('not implemented');
  }

  toString(options) {
    if (this.#isIANA) {
      return this.#impl.toString(options);
    }
    throw new Error('not implemented');
  }

  toJSON() {
    return this.toString();
  }
}