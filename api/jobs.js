export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { q = "software developer", location = "India" } = req.query;

  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      message: "RAPIDAPI_KEY is missing in Vercel environment variables"
    });
  }

  try {
    const url =
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q + " in " + location)}&page=1&num_pages=1`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: data.message || "RapidAPI request failed",
        details: data
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      message: error.message || "Server error while fetching jobs"
    });
  }
}
