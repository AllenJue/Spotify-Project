import express from "express";
import fetch from "node-fetch";
import request from "express";
const app = express();

app.set("views", "./views");
app.set("view engine", "pug");

app.use(express.static("public"));

const redirect_uri = "http://localhost:3000/callback";
const client_id = "";
const client_secret = "";
const required_scopes = "user-library-read user-top-read playlist-modify-public playlist-modify-private playlist-read-collaborative playlist-read-private user-read-email user-read-private user-top-read";

const MIN_SONGS = 10;
// global list of recommended songs and banned songs
let recommended_songs = [];
let banned_songs = new Set();
let active_playlist_id = "";
let user_id = "";
global.access_token;

app.get("/", function (req, res) {
  res.render("index");
});

/* Authorize user credentials w/ client_id, required_scopes, 
  and redirect_uri */
app.get("/authorize", (req, res) => {
  var auth_query_parameters = new URLSearchParams({
    response_type: "code",
    client_id: client_id,
    scope: required_scopes,
    redirect_uri: redirect_uri,
  });

  res.redirect(
    "https://accounts.spotify.com/authorize?" + 
        auth_query_parameters.toString()
  );
});

/* Sends the authorization request after details are submitted to get token */
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  await getToken(code);

  res.redirect("/dashboard");
});


/* Gets a token for the authorization process. May need to refresh */
async function getToken(code) {
  var body = new URLSearchParams({
    code: code,
    redirect_uri: redirect_uri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "post",
    body: body,
    headers: {
      "Content-type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
  });

  const data = await response.json();
  global.access_token = data.access_token;
}

/* Helper method to get data with Spotify endpoint format */
async function getData(endpoint) {
  const response = await fetch("https://api.spotify.com/v1" + endpoint, {
    method: "get",
    headers: {
      Authorization: "Bearer " + global.access_token,
    },
  });

  const data = await response.json();
  return data;
}

/* Sets up information for recommendations generated by a users top songs */
app.get("/dashboard", async (req, res) => {
  const userInfo = await getData("/me");
  const tracks = await getData("/me/tracks?limit=10");
  user_id = userInfo.id;
  // get user playlists
  const user_playlists = await getData("/users/" + userInfo.id + "/playlists");
  // render dashboard w/ userInfo, tracks, and playlists
  let playlists_owned_by_user = [];
  for (var i = 0; i < user_playlists.items.length; i++) {
    if(user_playlists.items[i].owner.id == user_id) {
      playlists_owned_by_user.push(user_playlists.items[i]);
    }
  }
  res.render("dashboard", { user: userInfo, tracks: tracks.items,
      playlists: playlists_owned_by_user});
});

/* Generates all the recommendations given a playlist. Selects songs randomly 
  to have a fair chance at all genres */
app.get("/generate_recs", async (req, res) => {
  // only cleared the first time banned songs are generating for a playlist
  banned_songs.clear();
  active_playlist_id = req.query.playlist_id;
  const playlist_data = await getData("/playlists/" + active_playlist_id);
  const tracks = playlist_data.tracks.items;
  for (var i = 0; i < tracks.length; i++) {
    banned_songs.add(tracks[i].track.id);
  }
  recommended_songs = [];
  // shuffle tracks
  await add_new_recs ();
  // console.log(recommended_songs[recommended_songs.length - 1]);
  res.render("recommendation", { recommended_song: recommended_songs
    [recommended_songs.length - 1] });
});

/* Generates new recs with the active playlist and populates recommended songs 
  with them */
async function add_new_recs() {
  const playlist_data = await getData("/playlists/" + active_playlist_id);
  const tracks = playlist_data.tracks.items;
  // shuffle tracks
  const RANDOMIZE_HALF = 0.5;
  tracks.sort(() => (Math.random() > RANDOMIZE_HALF) ? 1 : -1);
  while (recommended_songs.length < MIN_SONGS) {
    // pick a random song
    var i = Math.floor(Math.random() * tracks.length); 
    const artist_id = tracks[i].track.artists[0].id;
    const artist_data = await getData("/artists/" + artist_id);
    const seed_genres = artist_data.genres[0];
    const seed_tracks = tracks[i].track.id;
    if(artist_data != null && seed_genres != null && seed_tracks != null) {
      const params = new URLSearchParams({
        limit: 2,
        seed_artist: artist_id,
        seed_genres: seed_genres,
        seed_tracks: seed_tracks
      });
      // find recommendations, and add them to the list
      const recommendations = await getData("/recommendations?" + params);
      for (var j = 0; j < recommendations.tracks.length; j++) {
        if (!banned_songs.has(recommendations.tracks[j].id) 
            && recommendations.tracks[j].preview_url != null) {
          recommended_songs.push(recommendations.tracks[j]);
          banned_songs.add(recommendations.tracks[j].id);
        }
      }
    }
  }
}

/* Adds a song to the current open playlist */
async function addSong(songURI) {
  // for some reason need to replace ':' with "%3A"
  var url = "https://api.spotify.com/v1/playlists/" + active_playlist_id + 
      "/tracks?uris=" + songURI.replaceAll(":", "%3A");
  // call the post command to add a song to the playlist
  const response = await fetch (url, {
    method: "post",
    headers: {
      "Content-type": "application/json",
      Authorization: "Bearer " + global.access_token,
    },
  });
}

/* Updates the recommended song list after someone has clicked √ or X */
app.get("/update_recs", async (req, res) => {
  const add = req.query.add;
  const removed_song = recommended_songs.pop();
  await add_new_recs ();

  if(add == 't') {
    console.log("adding");
    console.log(removed_song);
    await addSong(removed_song.uri);
  } else {
    console.log("Not adding");
  }
  // generate new songs when out of songs
  if(recommended_songs.length == 0) {
    await add_new_recs();
  }
  console.log(recommended_songs[recommended_songs.length - 1].preview_url);
  res.render("recommendation", { recommended_song: recommended_songs
    [recommended_songs.length - 1]});

});

let listener = app.listen(3000, function () {
  console.log(
    "Your app is listening on http://localhost:" + listener.address().port
  );
});
