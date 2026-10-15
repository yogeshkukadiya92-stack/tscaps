import unittest
from unittest.mock import Mock
from cleanup import cleanup_once


class RetentionTests(unittest.TestCase):
    def test_empty_pass_does_not_delete(self):
        request = Mock(return_value=[])
        self.assertEqual(cleanup_once('https://example.test', 'secret', request), 0)
        self.assertEqual(request.call_count, 1)

    def test_deletes_only_candidates_via_storage_api(self):
        request = Mock(side_effect=[[{'name': 'owner/project/source.mp4'}], []])
        self.assertEqual(cleanup_once('https://example.test', 'secret', request), 1)
        self.assertEqual(request.call_args.args[2:], (
            '/storage/v1/object/reelstudio-videos', 'DELETE',
            {'prefixes': ['owner/project/source.mp4']}))

    def test_failed_delete_is_not_reported_as_success(self):
        request = Mock(side_effect=[[{'name': 'owner/video'}], TimeoutError()])
        with self.assertRaises(TimeoutError):
            cleanup_once('https://example.test', 'secret', request)

    def test_malformed_candidates_are_refused(self):
        request = Mock(return_value=[{'name': ''}])
        with self.assertRaises(ValueError):
            cleanup_once('https://example.test', 'secret', request)
        self.assertEqual(request.call_count, 1)


if __name__ == '__main__':
    unittest.main()
