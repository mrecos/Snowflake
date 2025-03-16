-- APPROACH 1: Precise Second-by-Second QPS with Cluster Awareness
WITH 
-- First, establish the time range of our analysis
time_boundaries AS (
  SELECT 
    MIN(START_TIME) AS min_time,
    MAX(END_TIME) AS max_time
  FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
  WHERE SESSION_ID = '1417812153059730'
    AND QUERY_TAG ILIKE('SECURITY_10K-P1%')
    AND QUERY_TYPE = 'SELECT'
),
-- Generate a series of time slices at 1-second intervals
time_series AS (
  SELECT 
    DATEADD('second', seq4(), (SELECT min_time FROM time_boundaries)) AS slice_time
  FROM TABLE(GENERATOR(ROWCOUNT => 
    DATEDIFF('second', 
      (SELECT min_time FROM time_boundaries), 
      (SELECT max_time FROM time_boundaries)) + 1
  ))
),
-- Get all active queries during each second, with their cluster numbers
active_queries AS (
  SELECT 
    t.slice_time,
    q.QUERY_ID,
    q.CLUSTER_NUMBER,
    COUNT(DISTINCT q.QUERY_ID) OVER (PARTITION BY t.slice_time) AS concurrent_queries,
    COUNT(DISTINCT q.CLUSTER_NUMBER) OVER (PARTITION BY t.slice_time) AS active_clusters
  FROM time_series t
  JOIN SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY q
    ON t.slice_time BETWEEN q.START_TIME AND q.END_TIME
  WHERE q.SESSION_ID = '1417812153059730'
    AND q.QUERY_TAG ILIKE('SECURITY_10K-P1%')
    AND q.QUERY_TYPE = 'SELECT'
),
-- Calculate per-second metrics
second_metrics AS (
  SELECT 
    slice_time,
    concurrent_queries AS qps,
    active_clusters,
    concurrent_queries / NULLIF(active_clusters, 0) AS qps_per_cluster,
    -- Moving average for smoother visualization
    AVG(concurrent_queries) OVER (
      ORDER BY slice_time
      ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING
    ) AS qps_moving_avg
  FROM active_queries
  GROUP BY slice_time, concurrent_queries, active_clusters
  ORDER BY slice_time
),
-- Calculate summary statistics
summary_stats AS (
  SELECT 
    COUNT(DISTINCT QUERY_ID) AS total_queries,
    DATEDIFF('second', MIN(slice_time), MAX(slice_time)) + 1 AS total_seconds,
    AVG(qps) AS avg_qps,
    MAX(qps) AS peak_qps,
    AVG(active_clusters) AS avg_active_clusters,
    MAX(active_clusters) AS max_active_clusters,
    SUM(qps) / NULLIF(SUM(active_clusters), 0) AS overall_qps_per_cluster
  FROM second_metrics
)

-- Output the detailed second-by-second metrics
SELECT * FROM second_metrics
ORDER BY slice_time;

-- APPROACH 2: Simplified Cluster-Aware QPS Analysis
WITH query_metrics AS (
  SELECT 
    QUERY_ID,
    START_TIME,
    END_TIME,
    CLUSTER_NUMBER,
    DATEDIFF('millisecond', START_TIME, END_TIME)/1000.0 AS duration_seconds
  FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
  WHERE SESSION_ID = '1417812153059730'
    AND QUERY_TAG ILIKE('SECURITY_10K-P1%')
    AND QUERY_TYPE = 'SELECT'
),
-- Calculate warehouse-wide and per-cluster metrics
summary_metrics AS (
  SELECT
    COUNT(*) AS total_queries,
    COUNT(DISTINCT CLUSTER_NUMBER) AS total_clusters,
    MIN(START_TIME) AS test_start_time,
    MAX(END_TIME) AS test_end_time,
    DATEDIFF('second', MIN(START_TIME), MAX(END_TIME)) AS test_duration_seconds,
    COUNT(*) / NULLIF(DATEDIFF('second', MIN(START_TIME), MAX(END_TIME)), 0) AS overall_qps,
    SUM(duration_seconds) / NULLIF(DATEDIFF('second', MIN(START_TIME), MAX(END_TIME)), 0) AS concurrency_factor
  FROM query_metrics
),
-- Get per-cluster statistics
cluster_metrics AS (
  SELECT
    CLUSTER_NUMBER,
    COUNT(*) AS queries_per_cluster,
    SUM(duration_seconds) AS total_processing_time,
    MIN(START_TIME) AS first_query_time,
    MAX(END_TIME) AS last_query_time,
    DATEDIFF('second', MIN(START_TIME), MAX(END_TIME)) AS cluster_active_seconds,
    COUNT(*) / NULLIF(DATEDIFF('second', MIN(START_TIME), MAX(END_TIME)), 0) AS cluster_qps
  FROM query_metrics
  GROUP BY CLUSTER_NUMBER
  ORDER BY CLUSTER_NUMBER
)

-- Output the summary metrics
SELECT 
  total_queries,
  total_clusters,
  test_duration_seconds,
  overall_qps AS warehouse_qps,
  concurrency_factor,
  overall_qps / NULLIF(total_clusters, 0) AS avg_qps_per_cluster
FROM summary_metrics;

-- Output per-cluster metrics
SELECT * FROM cluster_metrics;
