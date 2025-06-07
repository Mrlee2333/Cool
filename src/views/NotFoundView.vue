<template>
  <section class="hero is-fullheight-with-navbar is-dark">
    <div class="hero-body">
      <div class="container has-text-centered">
        <h1 class="title is-1 has-text-neon-primary">404</h1>
        <p class="subtitle is-3 has-text-light">Page Not Found</p>
        <p class="has-text-grey-light mb-5">The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.</p>
        <router-link to="/" class="button is-primary is-rounded is-medium">
          Go to Homepage
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
// No script needed for this simple page
</script>

<style scoped>
/* Add any specific styling for the 404 page */
.hero.is-dark {
  /* background: linear-gradient(135deg, #1f1f1f 0%, #101010 100%); */
}
</style>

