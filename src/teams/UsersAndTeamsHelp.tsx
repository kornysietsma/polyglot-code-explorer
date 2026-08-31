import HelpPanel from "../widgets/HelpPanel";

/** The panel's instructions - static text, extracted so it stops obscuring the markup. */
export const UsersAndTeamsHelp = () => (
  <HelpPanel>
    <strong>
      Note - changes won&apos;t be saved until you choose &ldquo;Save and
      close&rdquo; at the top!
    </strong>
    <h4>Users</h4>
    <p>
      Select users on the lower panel to show actions for aliasing and creating
      teams.
    </p>
    <p>
      You can click on the column headings to sort the table. You can also
      filter the user list by name and email with the filter field, and you can
      choose to only show selected users with the checkbox.
    </p>
    <h4>Aliases</h4>
    <p>
      Aliases allow you to merge duplicate users e.g. with multiple email
      addresses. An alias is just like a user, with a name and optional email
      address.
    </p>
    <p>You can:</p>
    <ul>
      <li>
        Create an alias by selecting one or more users and pressing the create
        button
      </li>
      <li>Add users to an alias by selecting an alias and one or more users</li>
      <li>Edit an alias (edit button on the right)</li>
    </ul>
    <p>(there is currently no way to delete an alias)</p>
    <h4>Teams</h4>
    <p>
      Teams allow you to group users, give them colours, and use the teams in
      other parts of the system
    </p>
    <p>You can:</p>
    <ul>
      <li>
        Create a team by selecting users in the user list, then pressing the
        create new team button.
      </li>
      <li>
        Add or remove users from a team by selecting users then pressing the
        appropriate button
      </li>
      <li>Change the colour shown for a team by clicking the colour button</li>
      <li>
        Hide a team by checking the &ldquo;hidden&rdquo; button - this acts as a
        filter in the rest of the system, that team will no longer be visible
      </li>
      <li>
        Rename a team by typing in the team name field - you need to click the ✓
        to apply the change. If the change is invalid the ✓ will be greyed out -
        hover over the button for the reason.
      </li>
      <li>
        Auto-colour teams - the auto-colour button assigns a set of up to 20
        colours that should be reasonably distinct to teams in a random order.
        Only shown teams are coloured this way!
      </li>
    </ul>
    <p></p>
  </HelpPanel>
);
