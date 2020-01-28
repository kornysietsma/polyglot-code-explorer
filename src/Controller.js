/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React from "react";

const Controller = props => {
  console.log("creating Controller");
  // console.log(props);
  const { data, state, dispatch } = props;

  const onSubmit = evt => {
    console.log("submit!");
    evt.preventDefault();
    const newShape = {
      color: "pink",
      width: 24
    };
    console.log("new shape", newShape);
    data.current.push(newShape);
    dispatch({ type: "addShape" });
  };

  // const onChange = (evt) => {
  // 	this.setState({[evt.target.name]: evt.target.value})
  // }

  return (
    <aside className="Controller">
      <form onSubmit={onSubmit}>
        <button type="submit">Add!</button>
      </form>
      <div>
        {/* should be a label but not ready to mess around with ids yet */}
        Scale
        <input
          name="scale"
          type="range"
          value={state.config.scale}
          min="1"
          max="500"
          onChange={evt =>
            dispatch({
              type: "setScale",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
      <div>
        Strength
        <input
          name="strength"
          type="range"
          value={state.expensiveConfig.strength}
          min="0"
          max="100"
          onChange={evt =>
            dispatch({
              type: "setStrength",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
    </aside>
  );
};

export default Controller;
