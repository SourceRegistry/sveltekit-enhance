<script lang="ts">
    import type { ActionData, PageData } from './$types.js';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<h1>In-memory notes demo</h1>
<p>Notes are cleared when the server restarts.</p>

<form method="POST">
    <label for="body">Note</label>
    <input id="body" name="body" maxlength="500" required />
    <button type="submit">Save</button>
</form>

{#if form?.message}<p role="alert">{form.message}</p>{/if}

<ul>
    {#each data.notes as note (note.id)}
        <li>{note.body}</li>
    {/each}
</ul>
