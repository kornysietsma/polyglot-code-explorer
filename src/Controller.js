/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";


const Controller = props => {
  console.log("creating Controller");
  // console.log(props);
  const { data, state, dispatch } = props;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));

  const onSubmit = evt => {
    console.log("submit!");
    evt.preventDefault();
    dispatch({ type: "addExpensive" });
  };

  // const onChange = (evt) => {
  // 	this.setState({[evt.target.name]: evt.target.value})
  // }

  return (
    <aside className="Controller">
      <label htmlFor={vizId}>
        Visualization:
        <select
          id={vizId}
          value={state.config.visualization}
          onChange={evt =>
            dispatch({ type: "setVisualization", payload: evt.target.value })
          }
        >
          <option value="loc">Lines of Code</option>
          <option value="depth">Nesting depth</option>
          <option value="toxicity">Toxicity</option>
        </select>
      </label>
      {state.config.visualization === "toxicity" ? (
        <p>Toxicity not yet implemented</p>
      ) : (
        ""
      )}
      <form onSubmit={onSubmit}>
        <button type="submit">Add 1 to Expensive!</button>
      </form>
      <div>
        {/* should be a label but not ready to mess around with ids yet */}
        Cheap
        <input
          name="cheap"
          type="range"
          value={state.config.cheapThing}
          min="1"
          max="500"
          onChange={evt =>
            dispatch({
              type: "setCheap",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
      <div>
        Expensive
        <input
          name="expensive"
          type="range"
          value={state.expensiveConfig.expensiveThing}
          min="0"
          max="100"
          onChange={evt =>
            dispatch({
              type: "setExpensive",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
      <div>
        Depth
        <input
          name="depth"
          type="range"
          value={state.expensiveConfig.depth}
          min="1"
          max="20"
          onChange={evt =>
            dispatch({
              type: "setDepth",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
    </aside>
  );
};

export default Controller;
