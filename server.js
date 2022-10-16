import express from "express";
import fetch from "node-fetch";

const app = express();

app.set("views", "./views");
app.set("view engine", "pug");

app.use(express.static("public"));

const redirect_uri = "http://localhost:3000/callback";
const client_id = "dbd1f18f1dc140debe467faba61bebb6";
const client_secret = "f470901d0e0d400b9e937f09782746d0";
const required_scopes = "user-library-read user-top-read playlist-modify-public playlist-modify-private playlist-read-collaborative playlist-read-private user-read-email user-read-private";

global.access_token;

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/authorize", (req, res) => {
  var auth_query_parameters = new URLSearchParams({
    response_type: "code",
    client_id: client_id,
    scope: required_scopes,
    redirect_uri: redirect_uri,
  });

  res.redirect(
    "https://accounts.spotify.com/authorize?" + auth_query_parameters.toString()
  );
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;

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

  res.redirect("/dashboard");
});

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

app.get("/dashboard", async (req, res) => {
  const userInfo = await getData("/me");
  const tracks = await getData("/me/tracks?limit=10");
  const top_songs = await getData("/me/top/tracks?limit=10");
  // console.log(top_songs);
  const genres = new Set();
  // console.log(tracks.items);
  for(var i = 0; i < tracks.items.length; i++) {
    const artist_id = tracks.items[i].track.album.artists[0].id;
    const artist_data = await getData("/artists/" + artist_id);
    for(var j = 0; j < artist_data.genres.length - 1; j++) {
      genres.add(artist_data.genres[j]);
    }
  }
  // console.log(genres);

  // get user playlists
  const user_playlists = await getData("/users/" + userInfo.id + "/playlists");
  // console.log(user_playlists.items[0].images[1].url);
  // render dashboard w/ userInfo, tracks, and playlists
  res.render("dashboard", { user: userInfo, tracks: tracks.items,
      playlists: user_playlists.items});
});

app.get("/recommendations", async (req, res) => {
  const playlist_name = req.query.playlist_name;
  console.log(playlist_name);
  // const params = new URLSearchParams({
  //   seed_artist: artist_id,
  //   seed_genres: "rock",
  //   seed_tracks: track_id,
  // });

  // const data = await getData("/recommendations?" + params);
  // res.render("recommendation", { tracks: data.tracks });
});

let listener = app.listen(3000, function () {
  console.log(
    "Your app is listening on http://localhost:" + listener.address().port
  );
});
