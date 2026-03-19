import { useEffect, useState } from "react";
import { API_BASE_URL } from "./config";

export default function TestApi() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/users`) // Test endpoint
      .then(res => res.json())
      .then(json => setData(json))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h1>Test API</h1>
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : "Loading..."}
    </div>
  );
}