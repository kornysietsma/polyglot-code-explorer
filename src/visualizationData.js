import React from "react";
import {
  nodeAge,
  nodeChurnCommits,
  nodeChurnDays,
  nodeChurnLines,
  nodeCreationDateClipped,
  nodeCumulativeLinesOfCode,
  nodeDepth,
  nodeIndentationP99,
  nodeIndentationStddev,
  nodeIndentationSum,
  nodeLanguage,
  nodeNumberOfChangers,
} from "./nodeData";
import {
  depthScaleBuilder,
  earlyLateScaleBuilder,
  goodBadUglyScaleBuilder,
  languageScaleBuilder,
  numberOfChangersScale,
} from "./ColourScales";
import { standardFillBuilder } from "./fillFunctions";
import {
  creationKeyData,
  depthKeyData,
  goodBadUglyColourKeyData,
  languageColourKeyData,
  numberOfChangersKeyData,
} from "./colourKeys";

const blankParent = () => undefined;

const VisualizationData = {
  language: {
    displayOrder: 0,
    title: "Programming Language",
    subVis: false,
    help: <p>Shows the most common programming languages</p>,
    dataFn: nodeLanguage,
    parentFn: blankParent,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: languageScaleBuilder,
    colourKeyBuilder: languageColourKeyData,
  },
  loc: {
    displayOrder: 1,
    title: "Lines of Code",
    subVis: false,
    help: (
      <div>
        <p>
          Large lines of code has been shown to be strongly correlated with
          complexity. Good code &ldquo;fits in your head&rdquo;.
        </p>
        <p>
          Note that the map has areas roughly proportional to lines of code, but
          the voronoi power map isn&apos;t perfect and areas may be distorted
        </p>
      </div>
    ),
    dataFn: nodeCumulativeLinesOfCode,
    parentFn: blankParent,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: goodBadUglyScaleBuilder(["loc"]),
    colourKeyBuilder: goodBadUglyColourKeyData(["loc"]),
  },
  depth: {
    displayOrder: 2,
    title: "Nesting depth",
    subVis: false,
    help: <p>Shows nesting depth in the directory structure</p>,
    dataFn: nodeDepth,
    parentFn: nodeDepth,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: depthScaleBuilder,
    colourKeyBuilder: depthKeyData,
  },
  indentation: {
    displayOrder: 3,
    title: "Indentation",
    subVis: true,
    defaultChild: "stddev",
    children: {
      sum: {
        title: "Total area",
        displayOrder: 0,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the total area - the sum of the
              indentation of all lines. It will highlight large files, which are
              often the source of issues.
            </p>
          </div>
        ),
        dataFn: nodeIndentationSum,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["indentation", "sum"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["indentation", "sum"]),
      },
      p99: {
        title: "Worst indentation",
        displayOrder: 1,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the worst indentation (the 99th
              percentile) of each file. It is better for spotting specific
              problems than overall complexity.
            </p>
          </div>
        ),
        dataFn: nodeIndentationP99,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["indentation", "p99"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["indentation", "p99"]),
      },
      stddev: {
        title: "Standard deviation",
        displayOrder: 2,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the standard deviation of indentations -
              it is a good indicator for complexity hot-spots.
            </p>
          </div>
        ),
        dataFn: nodeIndentationStddev,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["indentation", "stddev"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["indentation", "stddev"]),
      },
    },
  },
  age: {
    displayOrder: 4,
    title: "Age of last change",
    subVis: false,
    help: (
      <div>
        <p>Highlights code which has had no changes for some time.</p>
        <p>
          This may indicate code which has not been touched or refactored in a
          long time, indicating lost knowledge
        </p>
        <p>It may also indicate code that is stable and bug-free</p>
        <p>
          The real meaning may depend on development culture, and quality of
          testing
        </p>
      </div>
    ),
    dataFn: nodeAge,
    parentFn: blankParent,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: goodBadUglyScaleBuilder(["age"]),
    colourKeyBuilder: goodBadUglyColourKeyData(["age"]),
  },
  creation: {
    displayOrder: 5,
    title: "Creation date",
    subVis: false,
    help: (
      <div>
        <p>
          Creation date - only shows files created in the selected date range
        </p>
        <p>
          This isn&apos;t really related to quality, but is useful for
          visualizing code history
        </p>
        <p>
          Note that this is not a true historical view - the layout doesn&apos;t
          change with changing time scales, and deleted files aren&apos;t shown
          even if you select past dates.
        </p>
      </div>
    ),
    dataFn: nodeCreationDateClipped,
    parentFn: blankParent,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: earlyLateScaleBuilder,
    colourKeyBuilder: creationKeyData,
  },
  numberOfChangers: {
    displayOrder: 6,
    title: "Number of unique changers",
    subVis: false,
    help: (
      <div>
        <p>
          Shows unique changers in selected date range. Too few changers might
          indicate lack of shared understanding of code. Too many changers might
          indicate poorly designed code that has too many concerns and needs
          constant change.
        </p>
        <p>
          Note currently there is no way to distinguish one user with multiple
          logins from multiple people!
        </p>
      </div>
    ),
    dataFn: nodeNumberOfChangers,
    parentFn: blankParent,
    fillFnBuilder: standardFillBuilder,
    colourScaleBuilder: numberOfChangersScale,
    colourKeyBuilder: numberOfChangersKeyData,
  },
  churn: {
    displayOrder: 7,
    title: "Churn",
    subVis: true,
    defaultChild: "days",
    children: {
      days: {
        title: "Days containing a change",
        displayOrder: 0,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the proportion of days containing a
              change, so a value of &ldquo;1&rdquo; means the code changed every
              day.
            </p>
          </div>
        ),
        dataFn: nodeChurnDays,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["churn", "days"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["churn", "days"]),
      },
      commits: {
        title: "Commits per day",
        displayOrder: 1,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the number of commits per day, so a value
              of &ldquo;0.1&rdquo; means the code was committed on average once
              every ten days.
            </p>
          </div>
        ),
        dataFn: nodeChurnCommits,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["churn", "commits"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["churn", "commits"]),
      },
      lines: {
        title: "Lines per day",
        displayOrder: 2,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the number of lines changed per day, a
              sum of additions and deletions, so a value of &ldquo;10&rdquo;
              means ten lines of code were changed per day on average.
            </p>
            <p>
              Note this is a pretty rough measure - if someone added 10 lines
              then someone else deleted those 10 lines it will show up as a 20
              line difference
            </p>
          </div>
        ),
        dataFn: nodeChurnLines,
        parentFn: blankParent,
        fillFnBuilder: standardFillBuilder,
        colourScaleBuilder: goodBadUglyScaleBuilder(["churn", "lines"]),
        colourKeyBuilder: goodBadUglyColourKeyData(["churn", "lines"]),
      },
    },
  },
};

export default VisualizationData;
