// The timescale: the little activity chart along the bottom of the visualisation, and the brush
// over it that sets the date range everything else filters by.
//
// Like the coupling arcs it is SVG on top of the WebGL canvas, in its own `<svg class="timescale">`
// rather than the shared overlay. The pure parts - the day-to-pixel domain, which value each week
// plots, and what a brush drag means in unix time - are separated out and tested; `drawTimescale`
// itself is D3 selection code and is verified by the screenshot suite.

import * as d3 from "d3";
import {
  axisBottom,
  brushX,
  ScaleLinear,
  scaleLinear,
  ScaleTime,
  scaleUtc,
  Selection,
} from "d3";
import React from "react";

import { dateToUnix, unixToDate } from "../datetimes";
import { FeatureFlags } from "../polyglot_data.types";
import { TimescaleIntervalData } from "../preprocess";
import { State } from "../state";
import { Action } from "../state/actions";

// Deliberately not date-fns' `addDays`: this adds absolute elapsed time, which is what the
// UTC timescale below wants. date-fns' version is local-calendar-based, so it would shift by
// an hour across a DST boundary.
export function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setTime(result.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

// What each week's bar is a count of. Without git there are no commits to count, so it falls back
// to the number of files modified.
export function timescaleValueFn(features: FeatureFlags) {
  return features.git
    ? (d: TimescaleIntervalData) => d.commits
    : (d: TimescaleIntervalData) => d.files;
}

// The x axis' domain: the data's own span, padded a week each side so the first and last bars
// aren't flush against the edge.
export function timescaleDomain(
  timescaleData: TimescaleIntervalData[]
): [Date, Date] {
  const dateRange = d3.extent(timescaleData, (d) => d.day);
  if (dateRange[0] === undefined || dateRange[1] === undefined) {
    throw new Error("No date range in timescale data");
  }
  return [addUtcDays(dateRange[0], -7), addUtcDays(dateRange[1], 7)];
}

/**
 * What a finished brush drag means, in unix time - or `undefined` when it means nothing and no
 * action should be dispatched. `brush.move` below re-applies the current range on every redraw and
 * that fires "end" too, so a selection identical to the range already in state is the common case,
 * not an edge one: dispatching it would loop.
 */
export function brushedDateRange(
  selection: [number, number],
  xScale: ScaleTime<number, number, never>,
  earliest: number,
  latest: number
): [number, number] | undefined {
  const [startDate, endDate] = selection
    .map((x: number) => xScale.invert(x))
    .map(dateToUnix);
  if (startDate === undefined || endDate === undefined) return undefined;
  if (startDate === earliest && endDate === latest) return undefined;
  return [startDate, endDate];
}

export function drawTimescale(
  d3TimescaleContainer: React.RefObject<SVGSVGElement | null>,
  timescaleData: TimescaleIntervalData[],
  features: FeatureFlags,
  state: State,
  dispatch: React.Dispatch<Action>
) {
  const { config } = state;
  const { timescaleHeight } = config.layout;
  const {
    dateRange: { earliest, latest },
  } = config.filters;
  const margin = { left: 5, right: 5, bottom: 20, top: 10 };
  const height = timescaleHeight - (margin.bottom + margin.top);

  if (!d3TimescaleContainer.current) {
    console.warn("in drawTimescale but d3TimescaleContainer not yet current");
    return;
  }
  const vizEl = d3TimescaleContainer.current;
  const width = vizEl.clientWidth;
  const svg = d3
    .select(vizEl)
    .attr("viewBox", [0, 0, width, height])
    .style("height", `${height}px`);

  const valueFn = timescaleValueFn(features);

  // we might simplify these, from an overly generic example
  const area = (
    xScale: ScaleTime<number, number, never>,
    yScale: ScaleLinear<number, number, never>
  ) =>
    d3
      .area<TimescaleIntervalData>()
      // .defined(d => !isNaN(valueFn(d)))
      .x((d) => xScale(d.day))
      .y0(yScale(0))
      .y1((d) => {
        // console.log("y of", d, valueFn(d), y(valueFn(d)));
        return yScale(valueFn(d));
      });

  const yMax = d3.max(timescaleData, valueFn); // TODO - something better than max?
  if (yMax == undefined) {
    throw new Error("No maximum timescale");
  }

  const xScale: ScaleTime<number, number, never> = scaleUtc()
    .domain(timescaleDomain(timescaleData))
    .range([margin.left, width - margin.right, width]);
  const yScale: ScaleLinear<number, number, never> = scaleLinear()
    .domain([0, yMax])
    .range([height - margin.bottom, margin.top]);

  const xAxis = (
    g: Selection<SVGGElement, null, SVGSVGElement, unknown>,
    xScale: ScaleTime<number, number, never>,
    height: number
  ) =>
    g.attr("transform", `translate(0,${height - margin.bottom})`).call(
      axisBottom(xScale)
        .ticks(width / 80)
        .tickSizeOuter(0)
    );

  const brush = brushX<TimescaleIntervalData>()
    .extent([
      [margin.left, 0.5],
      [width - margin.right, height - margin.bottom + 0.5],
    ])
    .on("end", function ({ selection }: { selection: [number, number] }) {
      if (selection) {
        const dateRange = brushedDateRange(selection, xScale, earliest, latest);
        if (dateRange) {
          dispatch({ type: "setDateRange", payload: dateRange });
        }
      }
    });

  const selection: [number, number] = [
    xScale(unixToDate(earliest)),
    xScale(unixToDate(latest)),
  ];

  // update or draw x axis - using join as an experiment so we don't keep appending new axes on redraw
  svg
    .selectAll("g.x-axis")
    .data([null])
    .join((enter) =>
      enter.append("g").classed("x-axis", true).call(xAxis, xScale, height)
    );

  svg
    .selectAll("path.graph")
    .data([timescaleData])
    .join((enter) => enter.append("path").classed("graph", true))
    .attr("fill", "steelblue")
    .attr("d", area(xScale, yScale));

  svg
    .selectAll<SVGGElement, null>("g.brush")
    // TODO: UPGRADE: why why why?
    // examples use [null] but that doesn't type check
    .data([null] as unknown as TimescaleIntervalData[])
    .join((enter) => enter.append("g").classed("brush", true).call(brush))
    .call(brush.move, selection);
}
