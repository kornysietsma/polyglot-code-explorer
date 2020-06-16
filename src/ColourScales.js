import * as d3 from "d3";

export function numberOfChangersScale(config) {
    const {numberOfChangers: conf} = config;

    return d3
        .scaleLinear()
        .domain([
            0,
            1,
            conf.fewChangersMin,
            conf.fewChangersMax,
            conf.manyChangersMax
        ])
        .range([
            conf.noChangersColour,
            conf.oneChangerColour,
            conf.fewChangersMinColour,
            conf.fewChangersMaxColour,
            conf.manyChangersColour
        ])
        .interpolate(d3.interpolateHcl)
        .clamp(true);
}